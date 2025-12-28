import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// ★絶対に "export async function POST" でなければなりません（defaultはダメ）
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
    あなたは不動産のプロです。以下の見積書を解析し、JSON形式でのみ出力してください。
    Markdown記法は含めず、純粋なJSON文字列だけを返してください。

    【出力JSONの構造】
    {
      "property_name": "物件名（不明なら'不明'）",
      "room_number": "号室（不明なら'不明'）",
      "items": [
        {
          "name": "項目名",
          "price_original": 数値(円),
          "price_fair": 適正価格(円),
          "status": "fair|negotiable|cut",
          "reason": "短い理由",
          "is_insurance": true/false
        }
      ],
      "total_original": 合計金額(数値),
      "total_fair": 適正合計(数値),
      "discount_amount": 差額(数値),
      "savings_magic": "浮いたお金でできること",
      "pro_review": { "title": "総評タイトル", "content": "総評本文" },
      "knowledge": { "title": "豆知識タイトル", "content": "豆知識本文" }
    }
    `;

    parts.push({ text: prompt });

// ... (上の部分はそのまま)

    // 4. AIモデルの指定（★ここを最新の 2.5 Flash に変更！）
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", // ← これが正解です
      generationConfig: { responseMimeType: "application/json" }
    });

// ... (下もそのまま)

    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    
    const json = JSON.parse(responseText);
    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: "解析エラー", details: error.message }, { status: 500 });
  }
}