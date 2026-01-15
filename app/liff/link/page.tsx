'use client';

/**
 * LIFF自動紐づけページ
 * 
 * 1. LIFF初期化
 * 2. caseTokenをURLから取得
 * 3. accessTokenを取得
 * 4. サーバーに送信して案件を紐づけ
 * 5. 成功メッセージを送信
 * 6. ウィンドウを閉じる
 */

import { useEffect, useState } from 'react';

// LIFF型定義（簡易版）
declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      getAccessToken: () => string | null;
      sendMessages: (messages: any[]) => Promise<void>;
      closeWindow: () => void;
    };
  }
}

export default function LiffLinkPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    async function initLiff() {
      try {
        // 1. LIFF初期化
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId || liffId === 'your-liff-id-here') {
          throw new Error('LIFF IDが設定されていません');
        }

        await window.liff.init({ liffId });

        // ログインチェック
        if (!window.liff.isLoggedIn()) {
          throw new Error('LINEにログインしていません');
        }

        // 2. URLからcaseToken取得
        const params = new URLSearchParams(window.location.search);
        const caseToken = params.get('state');

        if (!caseToken) {
          throw new Error('リンク情報が見つかりません');
        }

        // 3. accessToken取得
        const accessToken = window.liff.getAccessToken();
        if (!accessToken) {
          throw new Error('認証トークンが取得できません');
        }

        // 4. サーバーに送信
        const res = await fetch('/api/line/link', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ caseToken }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'サーバーエラー');
        }

        // 5. 成功メッセージ送信（エラー時も処理は続行）
        try {
          await window.liff.sendMessages([
            {
              type: 'text',
              text: '✅ 引き継ぎが完了しました！\n\n「履歴」と送信すると案件を確認できます。',
            },
          ]);
        } catch (messageError: any) {
          // メッセージ送信が失敗しても連携は成功しているので、処理を続行
          console.warn('Failed to send LINE message:', messageError);
          // エラーは無視して処理を続行
        }

        setStatus('success');

        // 6. ウィンドウを閉じる（2秒後）
        setTimeout(() => {
          window.liff.closeWindow();
        }, 2000);
      } catch (error: any) {
        console.error('LIFF initialization error:', error);
        setStatus('error');
        setErrorMessage(error.message || 'エラーが発生しました');
      }
    }

    // LIFF SDKが読み込まれるまで待機
    if (typeof window !== 'undefined' && window.liff) {
      initLiff();
    } else {
      // 最大5秒待機
      let attempts = 0;
      const checkLiff = setInterval(() => {
        attempts++;
        if (window.liff) {
          clearInterval(checkLiff);
          initLiff();
        } else if (attempts > 50) {
          // 5秒経過
          clearInterval(checkLiff);
          setStatus('error');
          setErrorMessage('LIFF SDKの読み込みに失敗しました');
        }
      }, 100);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-3xl p-8 shadow-xl max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="mb-6">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">連携中...</h2>
            <p className="text-slate-400 text-sm">
              LINEアカウントと案件を紐づけています
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-6">
              <div className="text-6xl">✅</div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">連携完了！</h2>
            <p className="text-slate-400 text-sm">
              LINEに引き継ぎ完了メッセージを送信しました。
              <br />
              このウィンドウは自動的に閉じます。
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-6">
              <div className="text-6xl">❌</div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">エラー</h2>
            <p className="text-slate-400 text-sm mb-4">{errorMessage}</p>
            <p className="text-slate-500 text-xs">
              診断画面に戻って、もう一度「LINEで続き」ボタンを押してください。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
