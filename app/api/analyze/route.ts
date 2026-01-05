/**
 * 賃貸初期費用診断 API
 * 
 * シンプル版:
 * - 1回のAPI呼び出しで完結（タイムアウト対策）
 * - 厳格な判定ルールと具体的な根拠出力
 * - temperature=0で安定した出力
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    const parts: any[] = [];
    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    parts.push({
      inlineData: { mimeType: estimateFile.type, data: estimateBuffer.toString("base64") },
    });

    if (planFile) {
      const planBuffer = Buffer.from(await planFile.arrayBuffer());
      parts.push({
        inlineData: { mimeType: planFile.type, data: planBuffer.toString("base64") },
      });
    }

    if (conditionFile) {
      const conditionBuffer = Buffer.from(await conditionFile.arrayBuffer());
      parts.push({
        inlineData: { mimeType: conditionFile.type, data: conditionBuffer.toString("base64") },
      });
    }

    const prompt = `
あなたは「入居者の味方をする、経験豊富な不動産コンサルタント」です。
見積書と募集図面を**厳密に照合**し、不当な費用を見つけ出してください。

## 【画像の説明】
- 1枚目: 見積書（必須）
- 2枚目以降: 募集図面（マイソク）または条件欄のアップ画像（任意）

---

## 【重要】類似項目の名称マッチング

以下の項目は**同一項目**として扱ってください：
- 「入居者安心サポート」「24時間サポート」「24時間ライフサポート」「安心サポート」「緊急サポート」→ すべて同じ
- 「消毒」「抗菌」「室内消毒」「室内抗菌」「消毒施工」「抗菌消臭」「室内抗菌・消毒施工費」→ すべて同じ

---

## 【最重要】判定ルールと理由の書き方

### パターン1: 図面に「無料」と記載されている項目
図面に「無料」「0円」「サービス」と記載されているのに、見積書に金額がある場合：
→ status: "cut", price_fair: 0
→ reason: "**図面に「無料」と記載があるため、この請求は削除できます**"

### パターン2: 図面に記載がない項目
見積書にあるが、図面に一切記載がない付帯サービス：
→ status: "cut", price_fair: 0
→ reason: "**図面に記載がないため、削減交渉が可能です**"

対象: 消毒、抗菌、サポート、消火器、〇〇クラブなど

### パターン3: 図面に金額が記載されている項目
図面に金額が明記されていて、見積書と一致：
→ status: "fair"
→ reason: "**図面に記載があり、適正な費用です**"

### パターン4: 基本項目
- 敷金・礼金: 図面と一致なら → fair, "図面の記載と一致しており、適正です"
- 前家賃・管理費: → fair, "図面の記載と一致しており、適正です"
- 仲介手数料（1ヶ月分）: → negotiable, "法定上限は0.5ヶ月分のため、交渉の余地があります"
- 火災保険（20,000円超）: → negotiable, "相場より高めのため、交渉の余地があります"
- 保証会社: 50%程度なら → fair

---

## 【出力形式】JSON

{
  "property_name": "物件名",
  "room_number": "号室",
  "items": [
    {
      "name": "項目名",
      "price_original": 見積書の金額（数値）,
      "price_fair": 適正価格（数値）,
      "status": "fair" | "negotiable" | "cut",
      "reason": "上記パターンに従った理由",
      "evidence": {
        "flyer_evidence": "図面から読み取った原文（例: 入居者安心サポート: 無料）",
        "estimate_evidence": "見積書から読み取った原文",
        "source_description": "図面に「無料」と記載 / 図面に記載なし / 図面に○○円と記載"
      }
    }
  ],
  "total_original": 見積書合計,
  "total_fair": 適正合計,
  "discount_amount": 削減可能額,
  "risk_score": 0-100,
  "pro_review": {
    "content": "【総括】一言で結論"
  }
}

---

## 【チェックリスト】出力前に必ず確認

□ 図面に「無料」と記載されている項目が見積書で有料 → 必ずcut、理由は「図面に「無料」と記載があるため」
□ 図面に記載がない付帯サービス → 必ずcut、理由は「図面に記載がないため」
□ 図面に記載がある項目 → 基本的にfair、理由は「図面に記載があり」
`;

    parts.push({ text: prompt });

    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash";
    
    console.log("AI解析開始... モデル:", primaryModel);
    
    const model = genAI.getGenerativeModel({ 
      model: primaryModel, 
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0
      }
    });
    
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    console.log("AI応答を受信しました");
    
    // JSONパース
    let json;
    try {
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      json = JSON.parse(cleanedText);
    } catch (parseError: any) {
      console.error("JSON Parse Error:", parseError);
      console.error("Response text:", responseText.substring(0, 500));
      throw new Error(`AIの応答の解析に失敗しました: ${parseError.message}`);
    }
    
    // 後処理
    if (json.items && Array.isArray(json.items)) {
      json.items = json.items.map((item: any) => {
        if (item.price_original === null) {
          return {
            ...item,
            price_original: 0,
            requires_confirmation: true,
            reason: item.reason + "（※読み取り要確認）"
          };
        }
        return {
          ...item,
          requires_confirmation: false
        };
      });
      
      const hasUnconfirmed = json.items.some((item: any) => item.requires_confirmation);
      json.has_unconfirmed_items = hasUnconfirmed;
      json.unconfirmed_item_names = json.items
        .filter((item: any) => item.requires_confirmation)
        .map((item: any) => item.name);
    }

    console.log("診断完了:", {
      items_count: json.items?.length,
      total_original: json.total_original,
      discount_amount: json.discount_amount
    });

    return NextResponse.json({ result: json });

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
