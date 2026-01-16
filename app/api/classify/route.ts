/**
 * 画像分類API
 * 見積書/図面か、それ以外かを先に判定する
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "画像が必要です" }, { status: 400 });
    }

    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    const parts = [
      {
        inlineData: { mimeType: estimateFile.type, data: estimateBuffer.toString("base64") },
      },
    ];

    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-pro";

    const classificationPrompt = `
この画像を分析して、以下のどれに該当するか判定してください。

1. "estimate" - 賃貸の見積書・初期費用明細書
2. "flyer" - 賃貸の募集図面・マイソク
3. "face" - 人の顔が写っている写真
4. "animal" - 動物が写っている写真
5. "food" - 食べ物の写真
6. "scenery" - 風景・建物の写真
7. "other" - その他

JSON形式で出力してください:
{
  "type": "estimate" | "flyer" | "face" | "animal" | "food" | "scenery" | "other",
  "confidence": 0-100,
  "description": "画像の簡単な説明"
}
`;

    parts.push({ text: classificationPrompt } as any);

    const model = genAI.getGenerativeModel({
      model: primaryModel,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    console.log("分類API: モデル名:", primaryModel);
    let classification;
    try {
      const result = await model.generateContent(parts);
      const responseText = result.response.text();
      console.log("分類API応答（最初の500文字）:", responseText.substring(0, 500));
      const cleanedText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      classification = JSON.parse(cleanedText);
    } catch (parseError: any) {
      console.error("分類API JSON Parse Error:", parseError);
      console.error("Parse Error Details:", {
        message: parseError.message,
        name: parseError.name,
        stack: parseError.stack
      });
      throw new Error(`画像分類の解析に失敗しました: ${parseError.message}`);
    }

    // 裏コマンド対象かどうかを判定
    const isSecretMode = classification.type !== "estimate" && classification.type !== "flyer";

    return NextResponse.json({
      type: classification.type,
      isSecretMode,
      description: classification.description,
    });
  } catch (error: any) {
    console.error("Classification Error:", error);

    if (error.status === 429 || error.message?.includes("429")) {
      return NextResponse.json(
        { error: "APIレート制限に達しました", details: "しばらく時間をおいてから再度お試しください。" },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: "分類エラーが発生しました", details: error.message }, { status: 500 });
  }
}



