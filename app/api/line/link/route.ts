/**
 * LIFF→サーバー連携API
 *
 * POST /api/line/link
 * Headers: Authorization: Bearer {accessToken}
 * Input: { caseToken: string }
 * Output: { success: boolean, caseId: string }
 */

import { NextResponse } from 'next/server';
import { verifyAccessToken, createLineClient } from '@/lib/line-client';
import { consumeCaseToken, linkCaseToUser, setActiveCase, getCase, setConversationState } from '@/lib/kv';

export const maxDuration = 30;

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

    // 6. 案件データを取得して診断結果の詳細メッセージを送信
    // 友だち追加状態を確認してからメッセージを送信
    try {
      const client = createLineClient();

      const logLineApiError = (label: string, err: any, extra?: Record<string, unknown>) => {
        const status =
          err?.statusCode ??
          err?.status ??
          err?.originalError?.response?.status ??
          err?.response?.status ??
          null;

        const responseBody =
          err?.originalError?.response?.data ??
          err?.response?.data ??
          err?.originalError?.body ??
          err?.body ??
          null;

        console.error(label, {
          lineUserId,
          caseId,
          status,
          responseBody,
          message: err?.message,
          stack: err?.stack,
          ...extra,
        });
      };
      
      // 友だち追加状態を確認（プロフィール取得で確認）
      // 友だち追加されていない場合、getProfileはエラーを返す
      // ただし、新規友達追加直後は一時的にエラーになる可能性があるため、エラーメッセージを確認
      let isFriend = false;
      try {
        await client.getProfile(lineUserId);
        isFriend = true;
      } catch (profileError: any) {
        const errorMessage = profileError.message || '';
        const errorStatus = profileError.status || profileError.statusCode || 0;
        // 友だち追加が必要なエラーのみを検出（404や401などの特定のエラーコード）
        // 500などのサーバーエラーは除外
        if (errorStatus === 404 || errorStatus === 400 || 
            errorMessage.includes('友だち追加') || 
            errorMessage.includes('not a friend') ||
            errorMessage.includes('LINEの友達ではない')) {
          logLineApiError('User is not a friend (getProfile failed)', profileError);
          // 連携自体は成功しているので、案件IDは返すが、メッセージ送信はスキップ
          return NextResponse.json({
            success: true,
            caseId,
            requires_friend_add: true,
            friend_add_url: process.env.NEXT_PUBLIC_LINE_URL || 'https://lin.ee/RSEtLGm',
            message: '友だち追加が必要です。友だち追加後、もう一度お試しください。'
          });
        } else {
          // その他のエラー（ネットワークエラーなど）の場合は、友だち追加済みとみなして続行
          logLineApiError('getProfile error (not friend-related), continuing', profileError);
          isFriend = true; // 続行を試みる
        }
      }

      const caseData = await getCase(caseId);
      if (!caseData) {
        throw new Error('Case data not found');
      }

      const result = caseData.result;
      const propertyConfirmQuestionText = '先ほど設定した物件名はこちらでお間違いないですか?';

      // 裏コマンド（占いモード）の場合
      if (result.is_secret_mode) {
        const message = `✨ ${result.fortune_title || 'スペシャル診断'}\n\n${result.fortune_summary || ''}\n\n「履歴」と送信すると、いつでも結果を確認できます。`;
        // 物件名が空/未取得でも、分岐開始の質問だけは必ず送る
        await setConversationState(lineUserId, 'property_confirm', caseId);

        await client.pushMessage(lineUserId, [
          { type: 'text', text: message },
          {
            type: 'text',
            text: propertyConfirmQuestionText,
            quickReply: {
              items: [
                { type: 'action', action: { type: 'message', label: 'はい', text: 'はい' } },
                { type: 'action', action: { type: 'message', label: 'いいえ', text: 'いいえ' } },
              ],
            },
          },
        ]);
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

        // 会話状態を保存（このあと「はい/いいえ」分岐を開始する）
        await setConversationState(lineUserId, 'property_confirm', caseId);

        // 登録直後は replyToken が無いので pushMessage に統一し、
        // 「診断結果 + 質問」を messages 配列で1回のAPI呼び出しで必ずセット送信する
        await client.pushMessage(lineUserId, [
          { type: 'text', text: message },
          {
            type: 'text',
            text: propertyConfirmQuestionText,
            quickReply: {
              items: [
                { type: 'action', action: { type: 'message', label: 'はい', text: 'はい' } },
                { type: 'action', action: { type: 'message', label: 'いいえ', text: 'いいえ' } },
              ],
            },
          },
        ]);
      }
    } catch (messageError: any) {
      // メッセージ送信が失敗した場合
      console.error('Failed to send LINE message', {
        lineUserId,
        caseId,
        status:
          messageError?.statusCode ??
          messageError?.status ??
          messageError?.originalError?.response?.status ??
          messageError?.response?.status ??
          null,
        responseBody:
          messageError?.originalError?.response?.data ??
          messageError?.response?.data ??
          messageError?.originalError?.body ??
          messageError?.body ??
          null,
        message: messageError?.message,
        stack: messageError?.stack,
      });
      
      // 友だち追加が必要なエラーの場合（LINE APIのエラーコード確認）
      const errorMessage = messageError.message || '';
      const errorStatus = messageError.status || messageError.statusCode || 0;
      
      if (errorStatus === 400 || errorMessage.includes('友だち追加') || errorMessage.includes('not a friend')) {
        // 連携自体は成功しているので、案件IDは返すが、メッセージ送信はスキップ
        return NextResponse.json({
          success: true,
          caseId,
          requires_friend_add: true,
          friend_add_url: process.env.NEXT_PUBLIC_LINE_URL || 'https://lin.ee/RSEtLGm',
          message: '友だち追加が必要です。友だち追加後、もう一度お試しください。'
        });
      }
      
      // その他のエラーはログに記録するだけ（連携は成功している）
      console.warn('Message send failed but linking succeeded:', messageError);
    }

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
