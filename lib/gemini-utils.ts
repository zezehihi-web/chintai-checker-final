/**
 * Google Generative AI SDK用のユーティリティ関数
 * 
 * 【重要】このファイルはGemini APIへのリクエスト時に使用する
 * 型安全なヘルパー関数を提供します。
 * 
 * ByteStringエラー（"Cannot convert argument to a ByteString"）を
 * 防ぐための厳密なバリデーションを実装しています。
 */

// ===== 型定義 =====

/**
 * Gemini APIに渡す画像パーツの型
 */
export interface GeminiImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

/**
 * Gemini APIに渡すテキストパーツの型
 */
export interface GeminiTextPart {
  text: string;
}

/**
 * Gemini APIに渡すコンテンツパーツの型（画像またはテキスト）
 */
export type GeminiContentPart = GeminiImagePart | GeminiTextPart;

/**
 * サポートする画像MIMEタイプ
 */
export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

// ===== バリデーション関数 =====

/**
 * 日本語（または他の非ASCII Unicode文字）が含まれているか確認
 * Base64データには絶対に日本語が含まれていてはいけない
 */
export function containsNonAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode > 127) {
      return true;
    }
  }
  return false;
}

/**
 * 文字列が有効なBase64形式か確認
 * Base64は [A-Za-z0-9+/=] のみで構成される
 */
export function isValidBase64(str: string): boolean {
  if (!str || typeof str !== "string" || str.length === 0) {
    return false;
  }
  // Base64文字列は4の倍数の長さである必要がある（パディング含む）
  // ただし、一部のエンコーダーはパディングを省略するため、長さチェックは緩くする
  return /^[A-Za-z0-9+/=]+$/.test(str);
}

/**
 * Data URLプレフィックスを除去
 * 例: "data:image/jpeg;base64,/9j/4AAQ..." -> "/9j/4AAQ..."
 */
export function stripDataUrlPrefix(str: string): string {
  const dataUrlPattern = /^data:[^;]+;base64,/;
  return str.replace(dataUrlPattern, "");
}

/**
 * MIMEタイプを検証し、サポートされている形式に正規化
 */
export function normalizeMimeType(mimeType: string | undefined): SupportedMimeType {
  if (!mimeType) {
    return "image/jpeg"; // デフォルト
  }
  
  const normalized = mimeType.toLowerCase().trim();
  
  if (SUPPORTED_MIME_TYPES.includes(normalized as SupportedMimeType)) {
    return normalized as SupportedMimeType;
  }
  
  // JPEGの別名をサポート
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }
  
  console.warn(`未サポートのMIMEタイプ: ${mimeType}、image/jpegにフォールバック`);
  return "image/jpeg";
}

// ===== 画像データ処理関数 =====

/**
 * ファイルからBase64データを安全に抽出
 * 
 * @param file - 画像ファイル
 * @returns Base64エンコードされた画像データとMIMEタイプ
 * @throws Error - ファイルが無効または読み取りに失敗した場合
 */
export async function extractBase64FromFile(file: File): Promise<{
  base64: string;
  mimeType: SupportedMimeType;
}> {
  // ファイルの検証
  if (!file) {
    throw new Error("ファイルがnullまたはundefinedです");
  }
  
  if (file.size === 0) {
    throw new Error("ファイルサイズが0です");
  }
  
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("ファイルサイズが20MBを超えています");
  }
  
  // MIMEタイプの検証
  const mimeType = normalizeMimeType(file.type);
  
  // ArrayBufferを取得してBase64に変換
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  
  // Base64データの検証
  if (!base64 || base64.length === 0) {
    throw new Error("Base64エンコードに失敗しました（空のデータ）");
  }
  
  // 非ASCII文字のチェック
  if (containsNonAscii(base64)) {
    const firstNonAsciiIndex = base64.split("").findIndex((char) => char.charCodeAt(0) > 127);
    const charCode = base64.charCodeAt(firstNonAsciiIndex);
    throw new Error(
      `Base64データに非ASCII文字が含まれています。` +
      `位置: ${firstNonAsciiIndex}, 文字コード: ${charCode}。` +
      `これは画像データの破損を示しています。`
    );
  }
  
  // Base64形式の検証
  if (!isValidBase64(base64)) {
    throw new Error(
      "Base64データの形式が無効です。" +
      "有効なBase64文字（A-Za-z0-9+/=）のみが許可されています。"
    );
  }
  
  return { base64, mimeType };
}

// ===== Geminiパーツ作成関数 =====

/**
 * 画像ファイルからGemini APIに渡す画像パーツを作成
 * 
 * @param file - 画像ファイル
 * @returns Gemini API用の画像パーツ
 * @throws Error - ファイルが無効または処理に失敗した場合
 */
export async function createImagePart(file: File): Promise<GeminiImagePart> {
  const { base64, mimeType } = await extractBase64FromFile(file);
  
  // 最終検証：inlineDataオブジェクトの構築前に再確認
  if (typeof base64 !== "string") {
    throw new Error(`base64の型が不正です: ${typeof base64}`);
  }
  
  if (containsNonAscii(base64)) {
    throw new Error("致命的エラー: 画像パーツ作成時にBase64データに非ASCII文字を検出");
  }
  
  return {
    inlineData: {
      mimeType,
      data: base64,
    },
  };
}

/**
 * Base64文字列から直接Gemini API用の画像パーツを作成
 * （既にBase64エンコード済みのデータを使用する場合）
 * 
 * @param base64 - Base64エンコードされた画像データ
 * @param mimeType - 画像のMIMEタイプ
 * @returns Gemini API用の画像パーツ
 * @throws Error - Base64データが無効な場合
 */
export function createImagePartFromBase64(
  base64: string,
  mimeType: string
): GeminiImagePart {
  // Data URLプレフィックスを除去
  const cleanBase64 = stripDataUrlPrefix(base64);
  
  // 検証
  if (!cleanBase64 || cleanBase64.length === 0) {
    throw new Error("Base64データが空です");
  }
  
  if (containsNonAscii(cleanBase64)) {
    const firstNonAsciiIndex = cleanBase64.split("").findIndex((char) => char.charCodeAt(0) > 127);
    const charCode = cleanBase64.charCodeAt(firstNonAsciiIndex);
    throw new Error(
      `Base64データに非ASCII文字が含まれています（直接作成時）。` +
      `位置: ${firstNonAsciiIndex}, 文字コード: ${charCode}。`
    );
  }
  
  if (!isValidBase64(cleanBase64)) {
    throw new Error("Base64データの形式が無効です（直接作成時）");
  }
  
  return {
    inlineData: {
      mimeType: normalizeMimeType(mimeType),
      data: cleanBase64,
    },
  };
}

/**
 * テキストプロンプトからGemini API用のテキストパーツを作成
 * 
 * @param text - プロンプトテキスト
 * @returns Gemini API用のテキストパーツ
 */
export function createTextPart(text: string): GeminiTextPart {
  if (!text || typeof text !== "string") {
    throw new Error("テキストが空またはnullです");
  }
  
  return { text };
}

/**
 * Gemini APIに渡すコンテンツ配列を作成
 * 
 * 【重要】この関数は画像パーツとテキストパーツを正しい順序で結合します。
 * 画像が先、テキストが後という順序を保証します（SDKの推奨順）。
 * 
 * @param imageParts - 画像パーツの配列
 * @param textPrompt - テキストプロンプト
 * @returns Gemini API用のコンテンツ配列
 */
export function buildGeminiContent(
  imageParts: GeminiImagePart[],
  textPrompt: string
): GeminiContentPart[] {
  // 画像パーツの検証
  if (!imageParts || imageParts.length === 0) {
    throw new Error("少なくとも1つの画像パーツが必要です");
  }
  
  // 各画像パーツの検証
  for (let i = 0; i < imageParts.length; i++) {
    const part = imageParts[i];
    
    if (!part || !part.inlineData) {
      throw new Error(`画像パーツ[${i}]が無効です: inlineDataがありません`);
    }
    
    if (!part.inlineData.data) {
      throw new Error(`画像パーツ[${i}]が無効です: dataがありません`);
    }
    
    if (typeof part.inlineData.data !== "string") {
      throw new Error(`画像パーツ[${i}]が無効です: dataが文字列ではありません（型: ${typeof part.inlineData.data}）`);
    }
    
    // 【最重要】日本語混入チェック
    if (containsNonAscii(part.inlineData.data)) {
      const firstNonAsciiIndex = part.inlineData.data.split("").findIndex((char) => char.charCodeAt(0) > 127);
      const charCode = part.inlineData.data.charCodeAt(firstNonAsciiIndex);
      const char = part.inlineData.data.charAt(firstNonAsciiIndex);
      throw new Error(
        `致命的エラー: 画像パーツ[${i}]のdataに非ASCII文字（日本語など）が含まれています。\n` +
        `位置: ${firstNonAsciiIndex}, 文字コード: ${charCode}, 文字: "${char}"\n` +
        `これはプロンプトテキストが画像データに混入していることを示しています。\n` +
        `コードを確認し、変数の取り違えがないか確認してください。`
      );
    }
    
    if (!isValidBase64(part.inlineData.data)) {
      throw new Error(`画像パーツ[${i}]が無効です: Base64形式ではありません`);
    }
  }
  
  // テキストパーツの作成
  // 【重要】テキストは必ず { text: string } オブジェクト形式に包む
  // 生の文字列を直接配列に入れると、undiciの_Headers.appendでエラーが発生する可能性がある
  const textPart = createTextPart(textPrompt);
  
  // テキストパーツの形式を厳密に検証
  if (!textPart || typeof textPart !== "object") {
    throw new Error("テキストパーツがオブジェクト形式ではありません");
  }
  if (!("text" in textPart)) {
    throw new Error("テキストパーツに'text'プロパティがありません");
  }
  if (typeof textPart.text !== "string") {
    throw new Error(`テキストパーツの'text'が文字列ではありません（型: ${typeof textPart.text}）`);
  }
  
  // 【重要】画像パーツ → テキストパーツの順序で結合（SDKの推奨順）
  // この順序が逆になると、SDKがテキストを画像データとして解釈してByteStringエラーが発生する
  const content: GeminiContentPart[] = [...imageParts, textPart];
  
  // 最終検証：全パーツが正しい形式になっているか確認
  for (let i = 0; i < content.length; i++) {
    const part = content[i];
    if (!part || typeof part !== "object") {
      throw new Error(`パーツ[${i}]がオブジェクト形式ではありません`);
    }
    if ("inlineData" in part) {
      // 画像パーツの検証（既に上で実施済みだが念のため）
      if (!part.inlineData || typeof part.inlineData !== "object") {
        throw new Error(`パーツ[${i}]（画像）のinlineDataが無効です`);
      }
    } else if ("text" in part) {
      // テキストパーツの検証
      if (typeof part.text !== "string") {
        throw new Error(`パーツ[${i}]（テキスト）のtextが文字列ではありません（型: ${typeof part.text}）`);
      }
      // 【最重要】テキストパーツが生の文字列ではなく、オブジェクト形式になっているか確認
      if (Array.isArray(part) || part.constructor === String) {
        throw new Error(`パーツ[${i}]が生の文字列です。必ず { text: string } 形式にしてください`);
      }
    } else {
      throw new Error(`パーツ[${i}]が無効な形式です（inlineDataもtextもありません）`);
    }
  }
  
  console.log("✅ Geminiコンテンツ構築完了:", {
    imageParts: imageParts.length,
    textLength: textPrompt.length,
    totalParts: content.length,
    order: "画像 → テキスト",
    textPartType: typeof textPart,
    textPartHasText: "text" in textPart,
  });
  
  return content;
}

// ===== デバッグ用関数 =====

/**
 * Geminiコンテンツ配列のデバッグ情報を出力
 */
export function debugGeminiContent(content: GeminiContentPart[]): void {
  console.log("🔍 Geminiコンテンツデバッグ情報:");
  console.log(`  - パーツ数: ${content.length}`);
  
  content.forEach((part, index) => {
    // 【重要】パーツの型を確認
    console.log(`  - パーツ[${index}]の型チェック:`);
    console.log(`    - typeof: ${typeof part}`);
    console.log(`    - Array.isArray: ${Array.isArray(part)}`);
    console.log(`    - constructor: ${part?.constructor?.name || "unknown"}`);
    
    if ("inlineData" in part) {
      const data = part.inlineData.data;
      const preview = data.substring(0, 20);
      const isAscii = !containsNonAscii(data);
      const isBase64Valid = isValidBase64(data);
      
      console.log(`  - パーツ[${index}]: 画像`);
      console.log(`    - MIMEタイプ: ${part.inlineData.mimeType}`);
      console.log(`    - データ長: ${data.length}`);
      console.log(`    - プレビュー: ${preview}...`);
      console.log(`    - ASCII only: ${isAscii ? "✅" : "❌"}`);
      console.log(`    - Base64形式: ${isBase64Valid ? "✅" : "❌"}`);
      
      if (!isAscii) {
        const firstNonAsciiIndex = data.split("").findIndex((char) => char.charCodeAt(0) > 127);
        const charCode = data.charCodeAt(firstNonAsciiIndex);
        console.log(`    - ⚠️ 非ASCII文字検出: 位置=${firstNonAsciiIndex}, コード=${charCode}`);
      }
    } else if ("text" in part) {
      console.log(`  - パーツ[${index}]: テキスト`);
      console.log(`    - オブジェクト形式: ✅ (${typeof part === "object" ? "object" : "❌"})`);
      console.log(`    - textプロパティ存在: ✅`);
      console.log(`    - textの型: ${typeof part.text}`);
      console.log(`    - 文字数: ${part.text.length}`);
      console.log(`    - プレビュー: ${part.text.substring(0, 50)}...`);
      
      // 【最重要】生の文字列でないことを確認
      if (typeof part !== "object" || Array.isArray(part)) {
        console.error(`    - ⚠️ 警告: パーツ[${index}]がオブジェクト形式ではありません！`);
      }
    } else {
      console.log(`  - パーツ[${index}]: 不明な形式`);
      console.log(`    - 内容: ${JSON.stringify(part).substring(0, 100)}`);
      console.error(`    - ⚠️ エラー: パーツ[${index}]が無効な形式です`);
    }
  });
}
