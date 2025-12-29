import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File;
    const planFile = formData.get("plan") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
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

    const prompt = `
    あなたは不動産賃貸のプロフェッショナルです。
    添付された「見積書」と「募集図面（マイソク）」を隅々まで精査し、借主の利益を守るための適正価格診断を行ってください。

    【最重要：図面読み取りの徹底】
    募集図面（マイソク）が添付されている場合、そこに記載された数字（敷金、礼金、賃料、共益費など）を絶対に見落とさないでください。
    特に「礼金」の有無や金額は重要です。図面に記載があるのに見積もりで分析漏れがないよう、微細な文字までチェックしてください。

    【判定ロジック】
    1. **図面との整合性（絶対基準）**
       - 図面に記載がある項目（礼金、鍵交換代など）は原則「適正（fair）」とします。
       - **重要:** 図面に記載がないのに見積もりに含まれている付帯商品（消毒、サポート、消火器など）は「削除推奨（cut）」としてください。
       - 「（任意）」「（オプション）」の表記があれば「交渉可（negotiable）」です。

    2. **火災保険**
       - 相場（2万円/2年）より高い場合は「交渉可」。自分で加入する選択肢を提示してください。

    3. **仲介手数料**
       - 原則0.5ヶ月分を適正とします。1ヶ月分の場合は「交渉可」。
       - 0.5ヶ月の場合でも、総評で「0円にできる可能性」を示唆してください。

    【出力JSON形式】
    Markdownは使用せず、以下のJSONのみを出力してください。
    savings_magic（浮いたお金）は不要です。

    {
      "property_name": "物件名（不明なら'不明'）",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名",
          "price_original": 数値,
          "price_fair": 適正数値,
          "status": "fair|negotiable|cut",
          "reason": "交渉理由",
          "is_insurance": true/false
        }
      ],
      "total_original": 合計金額,
      "total_fair": 適正合計,
      "discount_amount": 差額,
      "pro_review": { 
        "content": "この物件固有の初期費用に関する鋭い指摘と、次に取るべき具体的なベストアクションを一言で。" 
      },
      "risk_score": 0〜100の数値（払いすぎ危険度）
    }
    `;
    parts.push({ text: prompt });

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      generationConfig: { responseMimeType: "application/json" }
    });

    console.log("AI解析開始...");
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const json = JSON.parse(responseText);
    
    // 総評フォーマットの整形（AIの出力＋固定文言）
    if (json.pro_review && json.pro_review.content) {
      json.pro_review.content = `${json.pro_review.content}\n\n今回の診断結果はあくまで『書面上で分かる範囲』の減額です。下の「正確な詳細をチェックする」から確認可能です。`;
    }

    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: "解析エラーが発生しました", details: error.message }, { status: 500 });
  }
}