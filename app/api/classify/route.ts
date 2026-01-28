/**
 * 画像分類API
 * 見積書/図面か、それ以外かを先に判定する
 * 
 * 【重要】このAPIはGemini APIに画像を送信する前に、
 * 厳密なバリデーションを行い、ByteStringエラーを防止します。
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import {
  createImagePart,
  createTextPart,
  buildGeminiContent,
  debugGeminiContent,
  containsNonAscii,
  GeminiContentPart,
} from "@/lib/gemini-utils";

export const maxDuration = 30;

// APIキーの確認
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY が環境変数に設定されていません");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    // APIキーの再確認
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "APIキーが設定されていません" },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "画像が必要です" }, { status: 400 });
    }

    // ファイルタイプの検証
    if (!estimateFile.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "画像ファイルである必要があります" },
        { status: 400 }
      );
    }

    // ファイルサイズの検証
    if (estimateFile.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "画像サイズが大きすぎます（20MB以下にしてください）" },
        { status: 400 }
      );
    }

    console.log("🔍 画像分類開始:", {
      fileName: estimateFile.name,
      fileSize: estimateFile.size,
      fileType: estimateFile.type,
    });

    // 画像パーツを作成（ここで厳密なバリデーションが行われる）
    let imagePart;
    try {
      imagePart = await createImagePart(estimateFile);
      console.log("✅ 画像パーツ作成成功:", {
        mimeType: imagePart.inlineData.mimeType,
        dataLength: imagePart.inlineData.data.length,
      });
    } catch (imageError: any) {
      console.error("❌ 画像パーツ作成失敗:", imageError.message);
      return NextResponse.json(
        { 
          error: "画像の処理に失敗しました", 
          details: imageError.message 
        },
        { status: 400 }
      );
    }

    // 分類プロンプト
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

    // Geminiコンテンツを構築
    let content: GeminiContentPart[];
    try {
      content = buildGeminiContent([imagePart], classificationPrompt);
      
      // デバッグ出力
      debugGeminiContent(content);
    } catch (buildError: any) {
      console.error("❌ Geminiコンテンツ構築失敗:", buildError.message);
      return NextResponse.json(
        { 
          error: "リクエストの構築に失敗しました", 
          details: buildError.message 
        },
        { status: 500 }
      );
    }

    // モデルの設定
    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-pro";
    const model = genAI.getGenerativeModel({
      model: primaryModel,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    console.log("🤖 Gemini API呼び出し開始... モデル:", primaryModel);

    // 【重要】Gemini APIを呼び出す前の最終チェック
    for (let i = 0; i < content.length; i++) {
      const part = content[i];
      
      // パーツがオブジェクト形式であることを確認
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        console.error(`❌ 致命的エラー: パーツ[${i}]がオブジェクト形式ではありません`);
        return NextResponse.json(
          { 
            error: "リクエストの形式が不正です", 
            details: `パーツ[${i}]が正しい形式ではありません` 
          },
          { status: 400 }
        );
      }
      
      if ("inlineData" in part) {
        // 画像パーツの検証
        if (containsNonAscii(part.inlineData.data)) {
          console.error("❌ 致命的エラー: API呼び出し直前にBase64データに非ASCII文字を検出");
          return NextResponse.json(
            { 
              error: "画像データが破損しています", 
              details: "Base64データに無効な文字が含まれています" 
            },
            { status: 400 }
          );
        }
      } else if ("text" in part) {
        // 【最重要】テキストパーツが { text: string } 形式であることを確認
        if (typeof part.text !== "string") {
          console.error(`❌ 致命的エラー: パーツ[${i}]（テキスト）のtextが文字列ではありません（型: ${typeof part.text}）`);
          return NextResponse.json(
            { 
              error: "リクエストの形式が不正です", 
              details: `テキストパーツ[${i}]が正しい形式ではありません` 
            },
            { status: 400 }
          );
        }
        // 生の文字列でないことを確認
        if (part.constructor === String || typeof part === "string") {
          console.error(`❌ 致命的エラー: パーツ[${i}]が生の文字列です。必ず { text: string } 形式にしてください`);
          return NextResponse.json(
            { 
              error: "リクエストの形式が不正です", 
              details: `テキストパーツ[${i}]がオブジェクト形式ではありません` 
            },
            { status: 400 }
          );
        }
        console.log(`✅ パーツ[${i}]（テキスト）検証OK: { text: "${part.text.substring(0, 30)}..." }`);
      } else {
        console.error(`❌ 致命的エラー: パーツ[${i}]が無効な形式です（inlineDataもtextもありません）`);
        return NextResponse.json(
          { 
            error: "リクエストの形式が不正です", 
            details: `パーツ[${i}]が無効な形式です` 
          },
          { status: 400 }
        );
      }
    }

    // Gemini APIを呼び出し
    // 【重要】generateContentにはパーツ配列を直接渡す（SDKの正しい使い方）
    // 各パーツは必ず { inlineData: {...} } または { text: string } のオブジェクト形式である必要がある
    let classification;
    try {
      console.log("📤 generateContent呼び出し前の最終確認:");
      console.log(`  - パーツ数: ${content.length}`);
      console.log(`  - パーツ[0]の型: ${typeof content[0]}, キー: ${Object.keys(content[0] || {})}`);
      if (content.length > 1) {
        console.log(`  - パーツ[1]の型: ${typeof content[1]}, キー: ${Object.keys(content[1] || {})}`);
      }
      
      const result = await model.generateContent(content);
      const responseText = result.response.text();
      console.log("✅ 分類API応答受信（最初の500文字）:", responseText.substring(0, 500));
      
      const cleanedText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      classification = JSON.parse(cleanedText);
      
      console.log("✅ 分類結果:", classification);
    } catch (apiError: any) {
      console.error("❌ Gemini API呼び出しエラー:", apiError.message);
      
      // ByteStringエラーの場合は詳細な情報を出力
      if (apiError.message?.includes("ByteString")) {
        console.error("⚠️ ByteStringエラーが発生しました");
        console.error("これは画像データに無効な文字が含まれていることを示しています");
        
        // 各パーツの詳細を出力
        content.forEach((part, idx) => {
          if ("inlineData" in part) {
            const data = part.inlineData.data;
            console.error(`パーツ[${idx}] 画像データ:`, {
              length: data.length,
              first20: data.substring(0, 20),
              hasNonAscii: containsNonAscii(data),
            });
          }
        });
      }
      
      throw apiError;
    }

    // 裏コマンド対象かどうかを判定
    const isSecretMode = classification.type !== "estimate" && classification.type !== "flyer";

    return NextResponse.json({
      type: classification.type,
      isSecretMode,
      description: classification.description,
    });
  } catch (error: any) {
    console.error("❌ Classification Error:", error);

    if (error.status === 429 || error.message?.includes("429")) {
      return NextResponse.json(
        { 
          error: "APIレート制限に達しました", 
          details: "しばらく時間をおいてから再度お試しください。" 
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { 
        error: "分類エラーが発生しました", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}
