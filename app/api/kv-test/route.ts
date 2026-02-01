/**
 * Vercel KV接続テストAPI
 * KVが正しく動作するか確認
 */

import { NextResponse } from 'next/server';
import { getKvClient, getKvProvider } from '@/lib/kv';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const kv = await getKvClient();
    const provider = getKvProvider() || 'unknown';
    if (provider === 'memory') {
      throw new Error('外部KVが設定されていないため、メモリKVが使われています。');
    }

    // テスト用のキーで読み書き
    const testKey = 'test:connection';
    const testValue = { timestamp: Date.now(), message: 'KV connection test' };

    await kv.setex(testKey, 60, testValue); // 60秒で期限切れ
    const retrieved = await kv.get(testKey);

    return NextResponse.json({
      status: 'ok',
      message: 'Vercel KV is working',
      testValue,
      retrieved,
      connection: 'success',
      provider,
    });
  } catch (error: any) {
    console.error('KV Test Error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Vercel KV connection failed',
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
