/**
 * Gemini API 用ユーティリティ
 * 画像パーツの作成・コンテンツ構築・バリデーション
 */

/** 画像パーツ（Gemini API の inlineData 形式） */
export interface GeminiImagePart {
  inlineData: {
    mimeType: string;
    data: string; // Base64
  };
}

/** テキストパーツまたは画像パーツ */
export type GeminiContentPart =
  | { text: string }
  | GeminiImagePart;

/**
 * ファイルを Base64 に変換し、Gemini 用の画像パーツを返す
 */
export async function createImagePart(file: File): Promise<GeminiImagePart> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(bytes).toString("base64");

  const mimeType = file.type || "image/jpeg";
  return {
    inlineData: {
      mimeType,
      data: base64,
    },
  };
}

/**
 * テキストパーツを生成
 */
export function createTextPart(text: string): { text: string } {
  return { text };
}

/**
 * 画像パーツとプロンプトから Gemini 用コンテンツ配列を構築
 * 順序: 画像パーツ → テキスト（プロンプト）
 */
export function buildGeminiContent(
  imageParts: GeminiImagePart[],
  prompt: string
): GeminiContentPart[] {
  const parts: GeminiContentPart[] = [...imageParts];
  if (prompt && prompt.trim()) {
    parts.push({ text: prompt.trim() });
  }
  return parts;
}

/**
 * デバッグ用: コンテンツの概要をログ出力
 */
export function debugGeminiContent(content: GeminiContentPart[]): void {
  content.forEach((part, i) => {
    if ("inlineData" in part) {
      console.log(`  [${i}] image: mime=${part.inlineData.mimeType}, dataLen=${part.inlineData.data.length}`);
    } else if ("text" in part) {
      console.log(`  [${i}] text: "${part.text.substring(0, 50)}..."`);
    }
  });
}

/**
 * 文字列に非 ASCII 文字（コード > 127）が含まれるか判定
 * Base64 データにプロンプトが混入していないかの検証に使用
 */
export function containsNonAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return true;
  }
  return false;
}
