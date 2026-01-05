/**
 * 画像前処理モジュール
 * 
 * 設計原則:
 * 1. 書面画像の読み取り精度を向上
 * 2. コントラスト/シャープ化（サーバーサイドで可能な範囲）
 * 3. 将来的な条件欄トリミング対応の基盤
 */

/**
 * 画像バッファの情報
 */
export interface ImageBuffer {
  buffer: Buffer;
  mimeType: string;
}

/**
 * 画像の基本検証
 */
export function validateImage(file: File): { valid: boolean; error?: string } {
  // ファイルサイズ検証（20MB制限）
  if (file.size > 20 * 1024 * 1024) {
    return { valid: false, error: "画像サイズが大きすぎます（20MB以下にしてください）" };
  }
  
  // ファイルタイプ検証
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: "画像ファイルである必要があります" };
  }
  
  // サポートされるフォーマット
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!supportedTypes.includes(file.type)) {
    return { valid: false, error: "JPEG, PNG, WebP形式を推奨します" };
  }
  
  return { valid: true };
}

/**
 * FileをImageBufferに変換
 */
export async function fileToImageBuffer(file: File): Promise<ImageBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: file.type,
  };
}

/**
 * 画像の前処理（将来的な拡張用）
 * 
 * 注: Node.jsのサーバーサイドでの画像処理は、
 * sharp等のライブラリが必要。現時点では基本的な変換のみ。
 * 
 * 将来的な拡張:
 * - sharpを使った傾き補正(deskew)
 * - コントラスト/シャープ化
 * - 条件欄の自動トリミング
 */
export async function preprocessImage(imageBuffer: ImageBuffer): Promise<ImageBuffer> {
  // 現時点ではそのまま返す
  // 将来的にsharpを導入して前処理を追加
  
  console.log(`[Preprocessing] 画像処理: ${imageBuffer.mimeType}, ${imageBuffer.buffer.length} bytes`);
  
  return imageBuffer;
}

/**
 * 複数画像の前処理
 */
export async function preprocessImages(imageBuffers: ImageBuffer[]): Promise<ImageBuffer[]> {
  const processed: ImageBuffer[] = [];
  
  for (const img of imageBuffers) {
    const result = await preprocessImage(img);
    processed.push(result);
  }
  
  return processed;
}

/**
 * 画像の品質チェック（将来的な拡張用）
 */
export function checkImageQuality(imageBuffer: ImageBuffer): {
  quality: 'high' | 'medium' | 'low';
  recommendations: string[];
} {
  const recommendations: string[] = [];
  let quality: 'high' | 'medium' | 'low' = 'high';
  
  // サイズベースの品質チェック
  const sizeKB = imageBuffer.buffer.length / 1024;
  
  if (sizeKB < 50) {
    quality = 'low';
    recommendations.push('画像サイズが小さすぎます。高解像度の画像を使用してください。');
  } else if (sizeKB < 200) {
    quality = 'medium';
    recommendations.push('画像の解像度が低い可能性があります。');
  }
  
  // 将来的に追加:
  // - ブレ検出
  // - 傾き検出
  // - コントラスト不足検出
  
  return { quality, recommendations };
}

/**
 * ログ出力（個人情報をマスク）
 */
export function logImageProcessing(
  source: 'flyer' | 'estimate',
  imageCount: number,
  totalSize: number
): void {
  console.log(`[ImageProcessing] ${source}: ${imageCount}枚, ${(totalSize / 1024).toFixed(1)}KB`);
}

