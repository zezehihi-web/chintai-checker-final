/**
 * LINE Webhook受信API
 *
 * POST /api/line/webhook
 * Headers: x-line-signature
 * Input: LINE Webhook Events
 */

import { NextResponse } from 'next/server';
import { verifySignature } from '@/lib/line-signature';
import { createLineClient } from '@/lib/line-client';
import { getUserCases, setActiveCase, getActiveCase } from '@/lib/kv';
import type { WebhookEvent, MessageEvent, TextEventMessage } from '@line/bot-sdk';

// LINE WebhookはPOSTのみ受け付ける
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // 1. 署名検証
    const signature = req.headers.get('x-line-signature');
    const body = await req.text();

    if (!signature) {
      console.error('No signature header');
      // LINE Webhookは常に200を返す必要がある
      return NextResponse.json({ success: false, error: 'No signature' }, { status: 200 });
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    if (!verifySignature(body, signature, channelSecret)) {
      console.error('Invalid signature');
      // LINE Webhookは常に200を返す必要がある
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 200 });
    }

    // 2. イベント処理
    const events: WebhookEvent[] = JSON.parse(body).events;
    const client = createLineClient();

    for (const event of events) {
      // follow イベント（友だち追加）
      if (event.type === 'follow') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '友だち追加ありがとうございます！\n\n賃貸初期費用AI診断の結果をこちらで確認できます。\n\n診断ページで「LINEで続き」ボタンを押して連携してください。',
        });
        continue;
      }

      // message イベント（テキストメッセージのみ処理）
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        if (!userId) continue;

        const messageText = event.message.text.trim();

        // 「履歴」コマンド
        if (messageText === '履歴' || messageText === 'りれき' || messageText === 'history') {
          const cases = await getUserCases(userId, 5);

          if (cases.length === 0) {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'まだ案件がありません。\n診断ページで「LINEで続き」ボタンを押して連携してください。',
            });
          } else {
            let message = '📋 あなたの案件履歴（直近5件）\n\n';
            cases.forEach((c, index) => {
              message += `${index + 1}. ${c.display_title}\n`;
            });
            message += '\n番号を送信して案件を選択してください。';

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: message,
            });
          }
          continue;
        }

        // 数字（1-5）→ 案件選択
        const numberMatch = messageText.match(/^([1-5])$/);
        if (numberMatch) {
          const index = parseInt(numberMatch[1], 10) - 1;
          const cases = await getUserCases(userId, 5);

          if (index >= 0 && index < cases.length) {
            const selectedCase = cases[index];
            await setActiveCase(userId, selectedCase.case_id);

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: `✅ 「${selectedCase.display_title}」を選択しました。\n\n詳細を確認するには「はい」と送信してください。`,
            });
          } else {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '選択した番号が無効です。「履歴」と送信して案件一覧を確認してください。',
            });
          }
          continue;
        }

        // 「はい」→ アクティブ案件の詳細表示
        if (messageText === 'はい' || messageText === 'Yes' || messageText === 'yes') {
          const activeCase = await getActiveCase(userId);

          if (!activeCase) {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'アクティブな案件がありません。\n「履歴」と送信して案件を選択してください。',
            });
          } else {
            const result = activeCase.result;
            let detailMessage = `📊 案件詳細\n\n`;
            detailMessage += `提示額: ¥${result.total_original?.toLocaleString() || '0'}\n`;
            detailMessage += `適正額: ¥${result.total_fair?.toLocaleString() || '0'}\n`;
            detailMessage += `削減可能額: ¥${result.discount_amount?.toLocaleString() || '0'}\n\n`;
            detailMessage += `リスクスコア: ${result.risk_score || 0}/100\n\n`;
            detailMessage += `プロからのアドバイス:\n${result.pro_review?.content || '診断結果をご確認ください'}\n\n`;
            detailMessage += `交渉が面倒、怖いと感じる方は、弊社で全ての交渉を代行しお得に契約できるようサポートが可能です。希望の場合はLINEでご相談ください。`;

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: detailMessage,
            });
          }
          continue;
        }

        // その他のメッセージ → ヘルプ
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '【使い方】\n\n📋 「履歴」→ 案件一覧を表示\n🔢 番号（1-5）→ 案件を選択\n✅ 「はい」→ 選択した案件の詳細を表示\n\n診断ページで「LINEで続き」ボタンを押すと新しい案件を連携できます。',
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    // LINE Webhookは常に200を返す必要がある（エラー時も）
    // エラーはログに記録し、LINEには成功として返す
    return NextResponse.json({ 
      success: false, 
      error: 'Webhook処理に失敗しました', 
      details: error.message 
    }, { status: 200 });
  }
}
