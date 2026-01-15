/**
 * LINE APIクライアント
 *
 * LINE Profile API、Messaging APIの呼び出し
 */

import { Client } from '@line/bot-sdk';

/**
 * LINE Clientを作成
 * @returns LINE Client
 */
export function createLineClient(): Client {
  const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  };

  return new Client(config);
}

/**
 * LINE Profile APIでaccessTokenを検証し、userIdを取得
 * @param accessToken LIFF access token
 * @returns LINE User ID（検証失敗時はnull）
 */
export async function verifyAccessToken(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.line.me/v2/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('LINE Profile API error:', response.status, await response.text());
      return null;
    }

    const profile = await response.json();
    return profile.userId;
  } catch (error) {
    console.error('Error verifying access token:', error);
    return null;
  }
}
