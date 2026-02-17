/**
 * 正式概算見積書PDF生成・送信ユーティリティ
 *
 * Webhook や API ルートから呼び出して、
 * PDF生成 → Blob アップロード → LINE送信 を一括で行う。
 */

import { renderToBuffer } from '@react-pdf/renderer';
import { put } from '@vercel/blob';
import React from 'react';
import { createLineClient } from '@/lib/line-client';
import OfficialEstimatePdf from '@/lib/components/OfficialEstimatePdf';
import type { EstimateItem } from '@/lib/components/OfficialEstimatePdf';

export interface SendEstimatePdfParams {
  userId: string;
  caseId: string;
  result: any; // DiagnosisResult
}

export interface SendEstimatePdfResult {
  success: boolean;
  pdfUrl?: string;
  error?: string;
}

/**
 * 見積書PDFを生成し、Blobにアップロードし、LINEで送信する
 */
export async function sendEstimatePdf(
  params: SendEstimatePdfParams,
): Promise<SendEstimatePdfResult> {
  const { userId, caseId, result } = params;

  try {
    // 1. 明細データを組み立て（price_fair > 0 の項目のみ）
    const items: EstimateItem[] = (
      result.items as Array<{ name: string; price_fair: number | null }>
    )
      .filter(
        (item) =>
          item.price_fair !== null &&
          item.price_fair !== undefined &&
          item.price_fair > 0,
      )
      .map((item) => ({
        name: item.name,
        amount: item.price_fair as number,
      }));

    const totalAmount: number = result.total_fair ?? 0;
    const propertyName: string = result.property_name ?? '';
    const roomNumber: string = result.room_number ?? '';

    // 2. PDF生成
    const pdfBuffer = await renderToBuffer(
      React.createElement(OfficialEstimatePdf, {
        propertyName,
        roomNumber,
        items,
        totalAmount,
      }) as any,
    );

    // 3. Vercel Blob にアップロード
    const timestamp = Date.now();
    const fileName = `estimates/${caseId}_${timestamp}.pdf`;

    const blob = await put(fileName, pdfBuffer, {
      access: 'public',
      contentType: 'application/pdf',
    });

    const pdfUrl = blob.url;

    // 4. LINE メッセージ送信
    const client = createLineClient();

    await client.pushMessage(userId, [
      {
        type: 'text',
        text: 'ご確認ありがとうございます。当社（株式会社beberise）で契約した場合の概算見積書を作成いたしました。',
      },
      {
        type: 'text',
        text: '他社様の見積もりを元に、不要な費用を除き、適正な仲介手数料で計算しております。',
      },
      {
        type: 'flex',
        altText: '初期費用概算御見積書',
        contents: {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '初期費用概算御見積書',
                weight: 'bold',
                size: 'md',
                color: '#333333',
              },
            ],
            paddingAll: '16px',
            backgroundColor: '#f0f4f8',
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: propertyName
                  ? `物件: ${propertyName}`
                  : '概算見積書',
                size: 'sm',
                color: '#555555',
                wrap: true,
              },
              {
                type: 'text',
                text: `見積合計: ¥${totalAmount.toLocaleString('ja-JP')}`,
                size: 'lg',
                weight: 'bold',
                color: '#1a1a1a',
                margin: 'md',
              },
              {
                type: 'text',
                text: '下のボタンからPDFをダウンロードできます。',
                size: 'xs',
                color: '#888888',
                margin: 'md',
                wrap: true,
              },
            ],
            paddingAll: '16px',
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '見積書PDFを開く',
                  uri: pdfUrl,
                },
                style: 'primary',
                color: '#2563eb',
              },
            ],
            paddingAll: '12px',
          },
        },
      },
    ]);

    console.log(
      `[send-estimate-pdf] PDF sent successfully to ${userId}, url: ${pdfUrl}`,
    );

    return { success: true, pdfUrl };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[send-estimate-pdf] Error for user ${userId}:`, message);
    return { success: false, error: message };
  }
}
