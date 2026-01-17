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
import { getUserCases, setActiveCase, getActiveCase, getConversationState, setConversationState, getCase } from '@/lib/kv';
import type { WebhookEvent, MessageEvent, TextEventMessage, PostbackEvent, ImageEventMessage } from '@line/bot-sdk';

// LINE WebhookはPOSTのみ受け付ける
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// GET リクエストには200を返す（検証用）
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'LINE Webhook endpoint is ready',
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: Request) {
  console.log('=== LINE Webhook POST request received ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  try {
    // 1. 署名検証
    const signature = req.headers.get('x-line-signature');
    const body = await req.text();

    console.log('Signature:', signature ? 'Present' : 'Missing');
    console.log('Body length:', body.length);

    if (!signature) {
      console.error('No signature header');
      // LINE Webhookは常に200を返す必要がある
      return NextResponse.json({ success: false, error: 'No signature' }, { status: 200 });
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    console.log('Channel secret exists:', !!channelSecret);

    if (!verifySignature(body, signature, channelSecret)) {
      console.error('Invalid signature');
      // LINE Webhookは常に200を返す必要がある
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 200 });
    }

    console.log('Signature verified successfully');

    // 2. イベント処理
    const events: WebhookEvent[] = JSON.parse(body).events;
    console.log('Number of events:', events.length);

    const client = createLineClient();

    for (const event of events) {
      // follow イベント（友だち追加・ブロック解除）
      if (event.type === 'follow') {
        const userId = event.source.userId;
        if (!userId) continue;

        // 以前の案件があるか確認
        const userCases = await getUserCases(userId, 1); // 最新1件を取得
        
        if (userCases.length > 0) {
          // 以前の案件がある場合 → 最新の案件の診断結果を自動送信
          const latestCase = userCases[0];
          const result = latestCase.result;
          
          // アクティブ案件に設定
          await setActiveCase(userId, latestCase.case_id);
          
          // 診断結果を送信
          if (result.is_secret_mode) {
            // 裏コマンド（占いモード）の場合
            const message = `✨ ${result.fortune_title || 'スペシャル診断'}\n\n${result.fortune_summary || ''}\n\n「履歴」と送信すると、いつでも結果を確認できます。`;
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: message,
            });
          } else {
            // 通常の診断結果
            let message = `✅ 診断結果を引き継ぎました！\n\n`;
            message += `【物件情報】\n`;
            message += `${result.property_name || '物件名不明'}`;
            if (result.room_number) {
              message += ` ${result.room_number}`;
            }
            message += `\n\n`;
            message += `【診断サマリー】\n`;
            message += `見積書合計: ${result.total_original?.toLocaleString() || '0'}円\n`;
            message += `適正価格: ${result.total_fair?.toLocaleString() || '0'}円\n`;
            message += `💰 削減可能額: ${result.discount_amount?.toLocaleString() || '0'}円\n`;
            message += `⚠️ リスクスコア: ${result.risk_score || 0}点\n\n`;

            // 削減可能な項目を抽出
            const cutItems = result.items?.filter((item: any) => item.status === 'cut') || [];
            const negotiableItems = result.items?.filter((item: any) => item.status === 'negotiable') || [];

            if (cutItems.length > 0) {
              message += `【削減可能項目】\n`;
              cutItems.forEach((item: any) => {
                message += `❌ ${item.name}: ${item.price_original?.toLocaleString() || 0}円\n`;
                message += `   → ${item.reason}\n`;
              });
              message += `\n`;
            }

            if (negotiableItems.length > 0) {
              message += `【交渉推奨項目】\n`;
              negotiableItems.forEach((item: any) => {
                message += `⚡ ${item.name}: ${item.price_original?.toLocaleString() || 0}円\n`;
                message += `   → ${item.reason}\n`;
              });
              message += `\n`;
            }

            message += `「履歴」と送信すると、いつでも詳細を確認できます。`;

            await client.pushMessage(userId, {
              type: 'text',
              text: message,
            });

            // 診断結果送信後、すぐに物件確認の質問を送信（通常診断の場合のみ）
            const propertyName = result.property_name || '物件名不明';
            const roomNumber = result.room_number || '';
            const propertyDisplay = roomNumber ? `${propertyName} ${roomNumber}` : propertyName;

            // 会話状態を保存
            await setConversationState(userId, 'property_confirm', latestCase.case_id);

            // ボタンテンプレートメッセージで物件確認の質問を送信
            await client.pushMessage(userId, {
              type: 'template',
              altText: '確認する物件はこの物件で合ってますか？',
              template: {
                type: 'buttons',
                text: `確認する物件はこの物件で合ってますか？\n\n${propertyDisplay}`,
                actions: [
                  {
                    type: 'message',
                    label: 'はい',
                    text: `PROPERTY_CONFIRM_YES:${latestCase.case_id}`,
                  },
                  {
                    type: 'message',
                    label: 'いいえ',
                    text: `PROPERTY_CONFIRM_NO:${latestCase.case_id}`,
                  },
                  {
                    type: 'message',
                    label: '相談したい',
                    text: `PROPERTY_CONFIRM_CONSULT:${latestCase.case_id}`,
                  },
                ],
              },
            });
          }
        } else {
          // 以前の案件がない場合（新規ユーザー）
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '友だち追加ありがとうございます！\n\n賃貸初期費用AI診断の結果をこちらで確認できます。\n\n診断ページで「LINEで続き」ボタンを押して連携してください。',
          });
        }
        continue;
      }

      // message イベント（テキストメッセージのみ処理）
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        if (!userId) continue;

        const messageText = event.message.text.trim();

        // ボタンからのメッセージアクションを処理
        // PROPERTY_CONFIRM_YES:xxx, PROPERTY_CONFIRM_NO:xxx, PROPERTY_CONFIRM_CONSULT:xxx
        if (messageText.startsWith('PROPERTY_CONFIRM_')) {
          const parts = messageText.split(':');
          if (parts.length === 2) {
            const actionPart = parts[0]; // PROPERTY_CONFIRM_YES, PROPERTY_CONFIRM_NO, PROPERTY_CONFIRM_CONSULT
            const caseId = parts[1];

            if (actionPart === 'PROPERTY_CONFIRM_YES') {
              // 「はい」が選択された場合 → 申し込み希望を聞く
              await setConversationState(userId, 'application_intent', caseId);
              
              await client.replyMessage(event.replyToken, {
                type: 'template',
                altText: '申し込みを希望しますか？',
                template: {
                  type: 'buttons',
                  text: '申し込みを希望しますか？',
                  actions: [
                    {
                      type: 'message',
                      label: '申し込みする',
                      text: `APPLICATION_INTENT_YES:${caseId}`,
                    },
                    {
                      type: 'message',
                      label: '申し込みしない',
                      text: `APPLICATION_INTENT_NO:${caseId}`,
                    },
                    {
                      type: 'message',
                      label: '相談したい',
                      text: `APPLICATION_INTENT_CONSULT:${caseId}`,
                    },
                  ],
                },
              });
              continue;
            } else if (actionPart === 'PROPERTY_CONFIRM_NO') {
              // 「いいえ」が選択された場合 → 画像送信を促す
              await setConversationState(userId, 'waiting_images', caseId);
              
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: 'ごめん、こちらに見積書と図面をLINEのチャットで直接送ってくれない？',
              });
              continue;
            } else if (actionPart === 'PROPERTY_CONFIRM_CONSULT') {
              // 「相談したい」が選択された場合
              await setConversationState(userId, 'consultation', caseId);
              
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '了解だよ。じゃあ相談内容をざっくりにメッセージ（LINEのメッセージ）で教えてね。',
              });
              continue;
            }
          }
        }

        // APPLICATION_INTENT_YES:xxx, APPLICATION_INTENT_NO:xxx, APPLICATION_INTENT_CONSULT:xxx
        if (messageText.startsWith('APPLICATION_INTENT_')) {
          const parts = messageText.split(':');
          if (parts.length === 2) {
            const actionPart = parts[0]; // APPLICATION_INTENT_YES, APPLICATION_INTENT_NO, APPLICATION_INTENT_CONSULT
            const caseId = parts[1];

            if (actionPart === 'APPLICATION_INTENT_YES') {
              // 「申し込みする」が選択された場合 → 以後手動対応
              await setConversationState(userId, 'completed', caseId);
              
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '承知しました。担当者より詳細な初期費用の見積もりと申し込み方法について連絡いたします。',
              });
              // ここで手動対応の通知（例：エージェントへの通知、管理画面への記録など）
              console.log(`[Manual action required] User ${userId} wants to apply for case ${caseId}`);
              continue;
            } else if (actionPart === 'APPLICATION_INTENT_NO') {
              // 「申し込みしない」が選択された場合 → 物件探すシステムへのリンク
              await setConversationState(userId, 'completed', caseId);
              
              // スーモのURL（ダミー）
              const propertySearchUrl = 'https://suumo.jp/chintai/';
              
              await client.replyMessage(event.replyToken, {
                type: 'template',
                altText: '他の物件を探す',
                template: {
                  type: 'buttons',
                  text: 'そうか、じゃあ他の物件を探せるこちらのAIで物件探すシステムがあるからそちらを使ってね！',
                  actions: [
                    {
                      type: 'uri',
                      label: '物件を探す',
                      uri: propertySearchUrl,
                    },
                  ],
                },
              });
              continue;
            } else if (actionPart === 'APPLICATION_INTENT_CONSULT') {
              // 「相談したい」が選択された場合
              await setConversationState(userId, 'consultation', caseId);
              
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '了解だよ。じゃあ相談内容をざっくりにメッセージ（LINEのメッセージ）で教えてね。',
              });
              continue;
            }
          }
        }

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

        // 相談状態の場合、メッセージを受け取って以後手動対応
        const conversationState = await getConversationState(userId);
        if (conversationState && conversationState.step === 'consultation') {
          await setConversationState(userId, 'completed', conversationState.case_id);
          
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '相談内容を承知しました。担当者より返信いたします。',
          });
          
          // 相談内容をログに記録（手動対応用）
          console.log(`[Manual action required] Consultation from user ${userId}, case ${conversationState.case_id}: ${messageText}`);
          continue;
        }

        // その他のメッセージ → ヘルプ
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '【使い方】\n\n📋 「履歴」→ 案件一覧を表示\n🔢 番号（1-5）→ 案件を選択\n✅ 「はい」→ 選択した案件の詳細を表示\n\n診断ページで「LINEで続き」ボタンを押すと新しい案件を連携できます。',
        });
      }

      // message イベント（画像メッセージ）
      if (event.type === 'message' && event.message.type === 'image') {
        const userId = event.source.userId;
        if (!userId) continue;

        const conversationState = await getConversationState(userId);
        if (conversationState && conversationState.step === 'waiting_images') {
          // 画像受信を確認（通知のみ）
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '画像を確認しました。担当者より診断結果をご連絡いたします。',
          });
          
          // 画像受信をログに記録（手動対応用）
          console.log(`[Manual action required] Image received from user ${userId}, case ${conversationState.case_id}`);
          continue;
        }

        // 画像が送信されたが、待機状態でない場合
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '画像を受信しました。診断ページから「LINEで続き」ボタンを押して連携してください。',
        });
      }
    }

    console.log('=== Webhook processing completed successfully ===');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('=== Webhook error ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    // LINE Webhookは常に200を返す必要がある（エラー時も）
    // エラーはログに記録し、LINEには成功として返す
    return NextResponse.json({ 
      success: false, 
      error: 'Webhook処理に失敗しました', 
      details: error.message 
    }, { status: 200 });
  }
}
