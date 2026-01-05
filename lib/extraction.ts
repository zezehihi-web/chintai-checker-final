/**
 * 抽出モジュール
 * 
 * 設計原則:
 * 1. 画像から「事実」のみを抽出（診断・提案はしない）
 * 2. 各値に必ずevidence_text（根拠テキスト）を付与
 * 3. evidenceがなければvalueはnull
 * 4. 図面と見積書は別々のリクエストで処理（参照混線防止）
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  ExtractedFacts, 
  ExtractedField,
  ExtractionSource, 
  createEmptyExtractedFacts,
  EXTRACTION_JSON_SCHEMA 
} from './types';
import { normalizeFacts } from './normalizer';

// ====================================
// プロンプト定義
// ====================================

/** 省略表記辞書（プロンプトに含める） */
const ABBREVIATION_DICTIONARY = `
【省略表記辞書】以下の表記を正しく認識してください：

■ 礼金
- "礼1" / "礼金1" → 礼金1ヶ月
- "礼0" / "礼なし" / "礼金なし" / "なし" → 礼金0ヶ月
- "-" / "ー" / "未定" / "相談" → null（不明）

■ 敷金
- "敷1" / "敷金1" → 敷金1ヶ月
- "敷0" / "敷なし" / "敷金なし" → 敷金0ヶ月
- "-" / "ー" / "未定" / "相談" → null（不明）

■ 敷礼複合
- "敷礼 0/1" → 敷金0ヶ月、礼金1ヶ月
- "0/1" → 敷金0ヶ月、礼金1ヶ月

■ 仲介手数料
- "仲介無料" / "手数料無料" → 0ヶ月
- "0.5" / "0.5ヶ月" / "半月" → 0.5ヶ月
- "1" / "1ヶ月" → 1ヶ月

■ 0の判定ルール（最重要）
- "0" / "0円" / "なし" / "無し" / "無料" という明確な記載がある場合のみ0
- 記載がない / 読み取れない → 必ずnull（0にしてはいけない）
- 曖昧な場合 → null（0にしてはいけない）
`;

/** 募集図面（flyer）用プロンプト */
const FLYER_EXTRACTION_PROMPT = `
あなたは不動産の募集図面（マイソク）から情報を正確に抽出する専門家です。

【重要な役割】
画像から「事実」のみを抽出してください。診断や提案は一切しないでください。
各項目について、画像に記載されている「原文」を必ずevidence_textとして記録してください。

【最重要ルール】
1. evidence_text（根拠テキスト）がない項目は、valueを必ずnullにしてください
2. 「記載なし」「読み取れない」「不明」の場合は、valueをnullにしてください（0にしてはいけない）
3. valueを0にできるのは、"礼0" / "礼なし" / "0円" / "無料" など、0を示す明確な記載がある場合のみです
4. 曖昧な場合はnullを選択してください（安全側に倒す）

${ABBREVIATION_DICTIONARY}

【抽出対象項目】
- 物件名、号室
- 賃料（円）
- 管理費/共益費（円）
- 敷金（月数）
- 礼金（月数）
- 仲介手数料（月数または円）
- 保証会社料（円または%）
- 火災保険（円）
- 24時間サポート/〇〇クラブ等（円）
- 鍵交換（円）
- クリーニング/退去時費用（円）
- フリーレント（月数）
- その他の費用項目

【読み取り手順】
1. 画像全体を隅々まで確認（上部、下部、左右、備考欄、特記事項、小さな文字）
2. 表形式、箇条書き、文章形式など、あらゆる形式を読み取る
3. 各項目について、原文をそのままevidence_textに記録
4. confidence（信頼度0-1）を設定

【出力形式】
以下のJSON形式で出力してください。Markdownは使用しないでください。
`;

/** 見積書（estimate）用プロンプト */
const ESTIMATE_EXTRACTION_PROMPT = `
あなたは不動産の初期費用見積書から情報を正確に抽出する専門家です。

【重要な役割】
画像から「事実」のみを抽出してください。診断や提案は一切しないでください。
各項目について、画像に記載されている「原文」と「金額」を必ず記録してください。

【最重要ルール】
1. evidence_text（根拠テキスト）がない項目は、valueを必ずnullにしてください
2. 見積書に記載されている金額は、必ずそのままの数値で記録してください（0円と誤認しない）
3. 読み取れない項目はnullにしてください（0にしてはいけない）
4. 金額と項目名を正確に対応させてください

${ABBREVIATION_DICTIONARY}

【抽出対象項目】
- 物件名、号室
- 賃料（円）
- 管理費/共益費（円）
- 敷金（円または月数）
- 礼金（円または月数）
- 仲介手数料（円）
- 事務手数料（円）
- 保証会社料（円）
- 火災保険（円）
- 24時間サポート/〇〇サポート/〇〇クラブ/プレミアデスク等（円）
- 鍵交換/鍵代/鍵費用/カードキー設定等（円）
- クリーニング/退去時費用（円）
- 消毒/抗菌/害虫駆除等（円）
- その他の費用項目すべて

【鍵関連の表記バリエーション】
以下はすべて「鍵交換費用」として認識してください：
鍵交換、鍵代、鍵費用、鍵設定費用、カードキー設定費用、鍵交換費、鍵代金、
鍵交換代、オートロック設定、セキュリティ設定、キー設定、キー代、カギ交換、カギ代

【サポート関連の表記バリエーション】
以下はすべて「サポートサービス」として認識してください：
24時間サポート、24hサポート、〇〇サポート、〇〇クラブ、〇〇サービス、
プレミアデスク、プレミアサポート、メンテナンスサポート、生活サポート、入居サポート

【読み取り手順】
1. 見積書全体を隅々まで確認
2. 各行の項目名と金額を正確に読み取る
3. 金額は数値として記録（カンマ、円記号は除去）
4. 項目名をevidence_textに記録

【出力形式】
以下のJSON形式で出力してください。Markdownは使用しないでください。
`;

/** 検証用プロンプト（特定項目の再確認） */
export const VERIFICATION_PROMPT_TEMPLATE = `
あなたは不動産書類の検証専門家です。

【タスク】
以下の項目について、画像を再度確認し、正確な値を抽出してください。
対象項目: {field_name}

【最重要ルール】
1. 必ずevidence_text（原文）を記録してください
2. 読み取れない場合はnullにしてください（0にしてはいけない）
3. 0にできるのは、"0" / "なし" / "無料" など明確な記載がある場合のみ

${ABBREVIATION_DICTIONARY}

【出力形式】
{
  "field_name": "{field_name}",
  "value": 数値またはnull,
  "evidence_text": "画像から抽出した原文" または null,
  "confidence": 0-1の数値,
  "page_or_image_index": 0,
  "verification_note": "確認内容の説明"
}
`;

// ====================================
// 抽出関数
// ====================================

/**
 * 募集図面から情報を抽出
 */
export async function extractFromFlyer(
  genAI: GoogleGenerativeAI,
  imageBuffers: { buffer: Buffer; mimeType: string }[],
  modelName: string = "gemini-2.5-flash"
): Promise<ExtractedFacts> {
  console.log("[Extraction] 募集図面からの抽出開始...");
  
  const parts: any[] = [];
  
  // 画像をpartsに追加
  imageBuffers.forEach((img, index) => {
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.buffer.toString("base64") },
    });
  });
  
  // プロンプトを追加
  parts.push({ text: FLYER_EXTRACTION_PROMPT });
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: modelName, 
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    
    // JSONパース
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedText);
    
    // ExtractedFacts形式に変換
    const facts = convertToExtractedFacts(parsed, "flyer");
    
    // 正規化（evidenceがなければnullに）
    const normalizedFacts = normalizeFacts(facts);
    
    console.log("[Extraction] 募集図面からの抽出完了:", {
      property_name: normalizedFacts.property_name.value,
      key_money_months: normalizedFacts.key_money_months.value,
      key_money_evidence: normalizedFacts.key_money_months.evidence_text,
    });
    
    return normalizedFacts;
    
  } catch (error: any) {
    console.error("[Extraction] 募集図面抽出エラー:", error);
    return createEmptyExtractedFacts("flyer");
  }
}

/**
 * 見積書から情報を抽出
 */
export async function extractFromEstimate(
  genAI: GoogleGenerativeAI,
  imageBuffers: { buffer: Buffer; mimeType: string }[],
  modelName: string = "gemini-2.5-flash"
): Promise<ExtractedFacts> {
  console.log("[Extraction] 見積書からの抽出開始...");
  
  const parts: any[] = [];
  
  // 画像をpartsに追加
  imageBuffers.forEach((img, index) => {
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.buffer.toString("base64") },
    });
  });
  
  // プロンプトを追加
  parts.push({ text: ESTIMATE_EXTRACTION_PROMPT });
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: modelName, 
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    
    // JSONパース
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedText);
    
    // ExtractedFacts形式に変換
    const facts = convertToExtractedFacts(parsed, "estimate");
    
    // 正規化（evidenceがなければnullに）
    const normalizedFacts = normalizeFacts(facts);
    
    console.log("[Extraction] 見積書からの抽出完了:", {
      property_name: normalizedFacts.property_name.value,
      key_exchange: normalizedFacts.key_exchange.value,
      key_exchange_evidence: normalizedFacts.key_exchange.evidence_text,
      total_items: normalizedFacts.total_items_found,
    });
    
    return normalizedFacts;
    
  } catch (error: any) {
    console.error("[Extraction] 見積書抽出エラー:", error);
    return createEmptyExtractedFacts("estimate");
  }
}

/**
 * AIのレスポンスをExtractedFacts形式に変換
 */
function convertToExtractedFacts(parsed: any, source: ExtractionSource): ExtractedFacts {
  const facts = createEmptyExtractedFacts(source);
  
  // 各フィールドをマッピング
  const fieldMappings: Record<string, keyof ExtractedFacts> = {
    property_name: 'property_name',
    room_number: 'room_number',
    rent: 'rent',
    management_fee: 'management_fee',
    deposit_months: 'deposit_months',
    key_money_months: 'key_money_months',
    brokerage_fee: 'brokerage_fee',
    brokerage_fee_months: 'brokerage_fee_months',
    guarantee_fee: 'guarantee_fee',
    fire_insurance: 'fire_insurance',
    support_service: 'support_service',
    key_exchange: 'key_exchange',
    cleaning_fee: 'cleaning_fee',
    free_rent_months: 'free_rent_months',
  };
  
  for (const [parsedKey, factsKey] of Object.entries(fieldMappings)) {
    if (parsed[parsedKey]) {
      const field = parsed[parsedKey];
      (facts[factsKey] as ExtractedField<any>) = {
        value: field.value ?? null,
        evidence_text: field.evidence_text ?? null,
        confidence: field.confidence ?? 0,
        source,
        page_or_image_index: field.page_or_image_index ?? 0,
        extraction_note: field.extraction_note,
      };
    }
  }
  
  // その他の項目
  if (parsed.other_items && Array.isArray(parsed.other_items)) {
    facts.other_items = parsed.other_items.map((item: any) => ({
      name: item.name,
      value: {
        value: item.value?.value ?? null,
        evidence_text: item.value?.evidence_text ?? null,
        confidence: item.value?.confidence ?? 0,
        source,
        page_or_image_index: item.value?.page_or_image_index ?? 0,
      },
    }));
  }
  
  facts.total_items_found = parsed.total_items_found ?? 0;
  facts.extraction_timestamp = new Date().toISOString();
  
  return facts;
}

/**
 * 特定項目の再検証抽出
 */
export async function verifyField(
  genAI: GoogleGenerativeAI,
  imageBuffers: { buffer: Buffer; mimeType: string }[],
  fieldName: string,
  modelName: string = "gemini-2.5-flash"
): Promise<ExtractedField<number | string | null>> {
  console.log(`[Verification] ${fieldName} の再検証開始...`);
  
  const prompt = VERIFICATION_PROMPT_TEMPLATE.replace(/{field_name}/g, fieldName);
  
  const parts: any[] = [];
  imageBuffers.forEach((img) => {
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.buffer.toString("base64") },
    });
  });
  parts.push({ text: prompt });
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: modelName, 
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanedText);
    
    const field: ExtractedField<number | string | null> = {
      value: parsed.value ?? null,
      evidence_text: parsed.evidence_text ?? null,
      confidence: parsed.confidence ?? 0,
      source: "flyer", // 検証は主にflyerに対して行う
      page_or_image_index: parsed.page_or_image_index ?? 0,
      extraction_note: parsed.verification_note,
    };
    
    console.log(`[Verification] ${fieldName} 検証完了:`, {
      value: field.value,
      evidence: field.evidence_text,
      confidence: field.confidence,
    });
    
    return field;
    
  } catch (error: any) {
    console.error(`[Verification] ${fieldName} 検証エラー:`, error);
    return {
      value: null,
      evidence_text: null,
      confidence: 0,
      source: "flyer",
      page_or_image_index: 0,
      extraction_note: `検証エラー: ${error.message}`,
    };
  }
}

