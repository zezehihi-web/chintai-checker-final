/**
 * Vercel KV接続テストAPI
 * KVが正しく動作するか確認
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // NOTE: @vercel/kv が未インストールでもビルド/起動できるようにする
    // eslint-disable-next-line no-eval
    const req = (0, eval)('require') as NodeRequire;
    const mod = req('@vercel/kv') as { kv?: any };
    const kv = mod?.kv;
    if (!kv) {
      throw new Error('@vercel/kv が見つかりません。`npm install` を実行してください。');
    }

    // テスト用のキーで読み書き
    const testKey = 'test:connection';
    const testValue = { timestamp: Date.now(), message: 'KV connection test' };

    await kv.set(testKey, JSON.stringify(testValue), { ex: 60 }); // 60秒で期限切れ
    const retrieved = await kv.get(testKey);

    return NextResponse.json({
      status: 'ok',
      message: 'Vercel KV is working',
      testValue,
      retrieved,
      connection: 'success',
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
