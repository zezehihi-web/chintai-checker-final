/**
 * LINE Webhook署名検証
 *
 * x-line-signatureヘッダーとchannel_secretを使ってHMAC-SHA256で検証
 */

import crypto from 'crypto';

/**
 * LINE Webhook署名を検証
 * @param body リクエストボディ（文字列）
 * @param signature x-line-signatureヘッダーの値
 * @param channelSecret LINE Channel Secret
 * @returns 検証結果（true: 有効、false: 無効）
 */
export function verifySignature(
  body: string,
  signature: string,
  channelSecret: string
): boolean {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}
