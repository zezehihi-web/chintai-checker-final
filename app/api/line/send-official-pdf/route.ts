/**
 * 正式概算見積書PDF送信API（手動トリガー用）
 *
 * POST /api/line/send-official-pdf
 * Body: { userId: string; caseId: string }
 *
 * ※ 通常はWebhookフロー内で自動送信されるが、
 *   手動で再送信したい場合にこのAPIを使用する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCase } from '@/lib/kv';
import { sendEstimatePdf } from '@/lib/send-estimate-pdf';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, caseId } = body as { userId?: string; caseId?: string };

    if (!userId || !caseId) {
      return NextResponse.json(
        { error: 'userId and caseId are required' },
        { status: 400 },
      );
    }

    const caseData = await getCase(caseId);
    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const result = caseData.result;
    if (!result || !result.items) {
      return NextResponse.json(
        { error: 'Diagnosis result not found in case data' },
        { status: 400 },
      );
    }

    const pdfResult = await sendEstimatePdf({ userId, caseId, result });

    if (!pdfResult.success) {
      return NextResponse.json(
        { error: 'Failed to generate or send PDF', detail: pdfResult.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      pdfUrl: pdfResult.pdfUrl,
    });
  } catch (error) {
    console.error('[send-official-pdf] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate or send PDF',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
