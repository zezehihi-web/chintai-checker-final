/**
 * 案件作成＋caseToken発行API
 *
 * POST /api/case/create
 * Input: { result: AnalysisResult }
 * Output: { caseId: string, caseToken: string }
 */

import { NextResponse } from 'next/server';
import { createCase, createCaseToken } from '@/lib/kv';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { result } = body;

    if (!result) {
      return NextResponse.json(
        { error: '診断結果が必要です' },
        { status: 400 }
      );
    }

    // 1. 案件を作成
    const caseId = await createCase(result);

    // 2. caseTokenを発行（10分TTL）
    let caseToken = await createCaseToken(caseId);
    if (!caseToken) {
      caseToken = await createCaseToken(caseId);
    }

    return NextResponse.json({
      caseId,
      caseToken,
      token: caseToken,
    });
  } catch (error: any) {
    console.error('Case creation error:', error);
    return NextResponse.json(
      { error: '案件の作成に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}
