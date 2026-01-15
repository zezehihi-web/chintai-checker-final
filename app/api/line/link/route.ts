/**
 * LIFF→サーバー連携API
 *
 * POST /api/line/link
 * Headers: Authorization: Bearer {accessToken}
 * Input: { caseToken: string }
 * Output: { success: boolean, caseId: string }
 */

import { NextResponse } from 'next/server';
import { consumeCaseToken, linkCaseToUser, setActiveCase } from '@/lib/kv';
import { verifyAccessToken } from '@/lib/line-client';

export async function POST(req: Request) {
  try {
    // 1. Authorization ヘッダーから accessToken を取得
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7); // "Bearer " を除去

    const body = await req.json();
    const { caseToken } = body;

    if (!caseToken) {
      return NextResponse.json(
        { error: 'caseTokenが必要です' },
        { status: 400 }
      );
    }

    // 2. caseToken を検証・消費
    const caseId = await consumeCaseToken(caseToken);
    if (!caseId) {
      return NextResponse.json(
        { error: 'リンクの有効期限が切れました。診断画面に戻ってもう一度お試しください。' },
        { status: 400 }
      );
    }

    // 3. accessToken を検証して LINE User ID を取得
    const lineUserId = await verifyAccessToken(accessToken);
    if (!lineUserId) {
      return NextResponse.json(
        { error: '認証に失敗しました。もう一度お試しください。' },
        { status: 401 }
      );
    }

    // 4. 案件とユーザーを紐づけ
    await linkCaseToUser(caseId, lineUserId);

    // 5. アクティブ案件に設定
    await setActiveCase(lineUserId, caseId);

    return NextResponse.json({
      success: true,
      caseId,
    });
  } catch (error: any) {
    console.error('LINE link error:', error);
    return NextResponse.json(
      { error: 'LINEとの連携に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}
