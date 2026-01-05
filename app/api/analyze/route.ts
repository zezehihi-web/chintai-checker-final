/**
 * 賃貸初期費用診断 API
 * 
 * 改善版 v3:
 * - 2段階処理（抽出→判定）
 * - 判定を3回実行して多数決
 * - temperature=0で安定した出力
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 120; // 処理時間が長くなるため延長

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// 抽出結果の型定義
interface ExtractedItem {
  name: string;
  estimate_price: number | null;
  estimate_text: string;
  flyer_price: number | null;
  flyer_text: string | null;
  flyer_status: "recorded" | "free" | "not_found";
}

interface ExtractionResult {
  property_name: string;
  room_number: string;
  rent: number;
  management_fee: number;
  items: ExtractedItem[];
}

// 判定結果の型定義
interface JudgmentItem {
  name: string;
  price_original: number;
  price_fair: number;
  status: "fair" | "negotiable" | "cut";
  reason: string;
  evidence: {
    flyer_evidence: string | null;
    estimate_evidence: string | null;
    source_description: string;
  };
}

interface JudgmentResult {
  items: JudgmentItem[];
  total_original: number;
  total_fair: number;
  discount_amount: number;
  risk_score: number;
  pro_review: { content: string };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;
    const planFile = formData.get("plan") as File | null;
    const conditionFile = formData.get("condition") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
    }

    // ファイルサイズの検証
    if (estimateFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "見積書の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    if (planFile && planFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "募集図面の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    if (conditionFile && conditionFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "条件欄の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    // ファイルタイプの検証
    if (!estimateFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "見積書は画像ファイルである必要があります" }, { status: 400 });
    }

    if (planFile && !planFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "募集図面は画像ファイルである必要があります" }, { status: 400 });
    }

    if (conditionFile && !conditionFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "条件欄は画像ファイルである必要があります" }, { status: 400 });
    }

    // 画像データの準備
    const imageParts: any[] = [];
    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    imageParts.push({
      inlineData: { mimeType: estimateFile.type, data: estimateBuffer.toString("base64") },
    });

    if (planFile) {
      const planBuffer = Buffer.from(await planFile.arrayBuffer());
      imageParts.push({
        inlineData: { mimeType: planFile.type, data: planBuffer.toString("base64") },
      });
    }

    if (conditionFile) {
      const conditionBuffer = Buffer.from(await conditionFile.arrayBuffer());
      imageParts.push({
        inlineData: { mimeType: conditionFile.type, data: conditionBuffer.toString("base64") },
      });
    }

    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash";
    
    // ========================================
    // 【第1段階】項目の抽出
    // ========================================
    console.log("【第1段階】項目抽出開始...");
    
    const extractionPrompt = `
あなたは画像から情報を正確に抽出するOCRスペシャリストです。
見積書と募集図面から、すべての費用項目を抽出してください。

## 【重要】類似項目の名称統一ルール
以下の項目は同一として扱い、統一した名称で出力してください：
- 「入居者安心サポート」「24時間サポート」「24時間ライフサポート」「安心サポート」「緊急サポート」「ライフサポート」→「24時間サポート」
- 「消毒」「抗菌」「室内消毒」「室内抗菌」「消毒施工」「抗菌消臭」「室内抗菌・消毒施工費」→「室内消毒」
- 「簡易消火器具代」「消火器」「消火器代」→「消火器」
- 「鍵交換」「鍵代」「鍵費用」「鍵交換費用」「カードキー」→「鍵交換」

## 抽出ルール
1. **見積書から**: すべての項目名と金額を正確に読み取る
2. **図面から**: 各項目について以下を確認
   - 金額が記載されている → flyer_status: "recorded", flyer_price: 金額
   - 「無料」「0円」「サービス」と記載 → flyer_status: "free", flyer_price: 0
   - 記載なし → flyer_status: "not_found", flyer_price: null

## 出力形式（JSON）
{
  "property_name": "物件名",
  "room_number": "号室",
  "rent": 家賃（数値）,
  "management_fee": 管理費・共益費（数値）,
  "items": [
    {
      "name": "統一された項目名",
      "estimate_price": 見積書の金額（数値、なければnull）,
      "estimate_text": "見積書から読み取った原文",
      "flyer_price": 図面の金額（数値、無料なら0、記載なしならnull）,
      "flyer_text": "図面から読み取った原文（なければnull）",
      "flyer_status": "recorded" | "free" | "not_found"
    }
  ]
}

**重要**: 金額は数値のみ（カンマや円は除去）。見積書のすべての項目を漏れなく抽出すること。
`;

    const extractionParts = [...imageParts, { text: extractionPrompt }];
    
    let extractionResult: ExtractionResult;
    try {
      const model = genAI.getGenerativeModel({ 
        model: primaryModel, 
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0
        }
      });
      const response = await model.generateContent(extractionParts);
      const responseText = response.response.text();
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractionResult = JSON.parse(cleanedText);
      console.log("抽出完了:", extractionResult.items?.length, "項目");
    } catch (error: any) {
      console.error("抽出エラー:", error.message);
      throw new Error("画像からの情報抽出に失敗しました");
    }

    // ========================================
    // 【第2段階】判定（3回実行して多数決）
    // ========================================
    console.log("【第2段階】判定開始（3回実行）...");
    
    const judgmentPrompt = `
あなたは入居者の味方をする不動産コンサルタントです。
以下の抽出データを基に、各項目の適正性を判定してください。

## 抽出データ
${JSON.stringify(extractionResult, null, 2)}

## 【絶対ルール】判定基準

### ルール1: flyer_status = "free" の項目
図面に「無料」と記載されているのに見積書に金額がある
→ **必ず status: "cut", price_fair: 0, reason: "図面に無料と記載あり"**

### ルール2: flyer_status = "not_found" の項目
図面に記載がない項目は以下のように判定：
- 消毒・抗菌系 → **cut**（任意オプション）
- サポート系 → **cut**（任意オプション）
- 消火器 → **cut**（法的義務なし）
- 鍵交換 → **negotiable**（交渉余地あり）
- その他 → **negotiable**

### ルール3: flyer_status = "recorded" の項目
図面に金額記載あり
- 見積書と同額 → **fair**
- 見積書が高い → **negotiable**

### ルール4: 基本項目の判定
- 敷金・礼金: 図面と一致なら **fair**
- 前家賃・管理費: **fair**
- 仲介手数料: 家賃の1ヶ月分なら **negotiable**（0.5ヶ月が原則）、0.5ヶ月以下なら **fair**
- 火災保険: 20,000円以下なら **fair**、超えたら **negotiable**
- 保証会社: 50%程度なら **fair**

## 出力形式（JSON）
{
  "items": [
    {
      "name": "項目名",
      "price_original": 見積書の金額,
      "price_fair": 適正価格,
      "status": "fair" | "negotiable" | "cut",
      "reason": "判定理由",
      "evidence": {
        "flyer_evidence": "図面の記載内容",
        "estimate_evidence": "見積書の記載内容",
        "source_description": "判定根拠"
      }
    }
  ],
  "total_original": 見積書合計,
  "total_fair": 適正合計,
  "discount_amount": 削減可能額,
  "risk_score": 0-100,
  "pro_review": {
    "content": "【総括】一言で結論\\n\\n削減ポイントの説明"
  }
}
`;

    // 3回判定を実行
    const judgmentResults: JudgmentResult[] = [];
    
    for (let i = 0; i < 3; i++) {
      try {
        console.log(`判定 ${i + 1}/3 実行中...`);
        const model = genAI.getGenerativeModel({ 
          model: primaryModel, 
          generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0
          }
        });
        const response = await model.generateContent([{ text: judgmentPrompt }]);
        const responseText = response.response.text();
        const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(cleanedText) as JudgmentResult;
        judgmentResults.push(result);
      } catch (error: any) {
        console.error(`判定 ${i + 1} エラー:`, error.message);
      }
    }

    if (judgmentResults.length === 0) {
      throw new Error("判定処理に失敗しました");
    }

    // ========================================
    // 【第3段階】多数決で最終判定
    // ========================================
    console.log("【第3段階】多数決処理...");
    
    // 各項目の判定を多数決で決定
    const finalItems: JudgmentItem[] = [];
    const allItemNames = new Set<string>();
    
    // すべての判定結果から項目名を収集
    for (const result of judgmentResults) {
      for (const item of result.items) {
        allItemNames.add(item.name);
      }
    }

    // 各項目について多数決
    for (const itemName of allItemNames) {
      const itemJudgments: JudgmentItem[] = [];
      
      for (const result of judgmentResults) {
        const item = result.items.find(i => i.name === itemName);
        if (item) {
          itemJudgments.push(item);
        }
      }

      if (itemJudgments.length === 0) continue;

      // statusの多数決
      const statusCounts: Record<string, number> = { fair: 0, negotiable: 0, cut: 0 };
      for (const item of itemJudgments) {
        statusCounts[item.status]++;
      }

      let finalStatus: "fair" | "negotiable" | "cut" = "fair";
      let maxCount = 0;
      for (const [status, count] of Object.entries(statusCounts)) {
        if (count > maxCount) {
          maxCount = count;
          finalStatus = status as "fair" | "negotiable" | "cut";
        }
      }

      // 多数決で決まった判定を持つ項目を選択
      const selectedItem = itemJudgments.find(i => i.status === finalStatus) || itemJudgments[0];
      
      // 一致度の情報を追加
      const agreementRate = Math.round((maxCount / judgmentResults.length) * 100);
      let reason = selectedItem.reason;
      if (agreementRate < 100) {
        reason += ` (判定一致率: ${agreementRate}%)`;
      }

      finalItems.push({
        ...selectedItem,
        status: finalStatus,
        reason: reason
      });
    }

    // 合計を再計算
    const total_original = finalItems.reduce((sum, item) => sum + (item.price_original || 0), 0);
    const total_fair = finalItems.reduce((sum, item) => sum + (item.price_fair || 0), 0);
    const discount_amount = total_original - total_fair;

    // risk_scoreは平均を取る
    const avgRiskScore = Math.round(
      judgmentResults.reduce((sum, r) => sum + (r.risk_score || 50), 0) / judgmentResults.length
    );

    // pro_reviewは最初の結果を使用
    const pro_review = judgmentResults[0]?.pro_review || { content: "診断完了" };

    // 最終結果を構築
    const finalResult = {
      property_name: extractionResult.property_name,
      room_number: extractionResult.room_number,
      items: finalItems.map(item => ({
        ...item,
        requires_confirmation: false
      })),
      total_original,
      total_fair,
      discount_amount,
      risk_score: avgRiskScore,
      pro_review,
      has_unconfirmed_items: false,
      unconfirmed_item_names: [] as string[]
    };

    console.log("診断完了:", {
      items_count: finalResult.items.length,
      total_original: finalResult.total_original,
      discount_amount: finalResult.discount_amount,
      judgment_runs: judgmentResults.length
    });

    return NextResponse.json({ result: finalResult });

  } catch (error: any) {
    console.error("Server Error:", error);
    
    let errorMessage = "解析エラーが発生しました";
    let errorDetails = error.message || "不明なエラー";
    
    if (error.status === 429 || error.message?.includes('429')) {
      errorMessage = "APIレート制限に達しました";
      errorDetails = "しばらく時間をおいてから再度お試しください。";
    } else if (error.message?.includes("JSON")) {
      errorMessage = "AIからの応答の解析に失敗しました";
      errorDetails = "もう一度お試しください。";
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails
    }, { status: error.status || 500 });
  }
}
