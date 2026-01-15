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
        console.log('LIFF ID:', liffId);
        
        if (!liffId || liffId === 'your-liff-id-here') {
          throw new Error('LIFF IDが設定されていません');
        }

        console.log('Initializing LIFF with ID:', liffId);
        try {
          await window.liff.init({ liffId });
          console.log('LIFF initialized successfully');
        } catch (initError: any) {
          console.error('LIFF init error:', initError);
          throw new Error(`LIFF初期化エラー: ${initError.message || '不明なエラー'}`);
        }

        // ログインチェック
        const isLoggedIn = window.liff.isLoggedIn();
        console.log('Is logged in:', isLoggedIn);
        
        if (!isLoggedIn) {
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
        console.log('Sending request to /api/line/link...');
        const res = await fetch('/api/line/link', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ caseToken }),
        });

        console.log('Response status:', res.status);
        const data = await res.json();
        console.log('Response data:', data);

        if (!res.ok) {
          throw new Error(data.error || 'サーバーエラー');
        }
        
        console.log('Link successful!');

        // 5. メッセージ送信はサーバー側で行われるため、ここでは何もしない
        // サーバー側（/api/line/link）でMessaging APIを使ってメッセージを送信

        setStatus('success');

        // 6. ウィンドウを閉じる（2秒後）
        setTimeout(() => {
          window.liff.closeWindow();
        }, 2000);
      } catch (error: any) {
        console.error('LIFF initialization error:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          cause: error.cause
        });
        setStatus('error');
        setErrorMessage(error.message || 'エラーが発生しました');
      }
    }

    // LIFF SDKが読み込まれるまで待機
    if (typeof window !== 'undefined') {
      if (window.liff) {
        console.log('LIFF SDK already loaded');
        initLiff();
      } else {
        console.log('Waiting for LIFF SDK to load...');
        // 最大10秒待機（LIFF SDKの読み込みに時間がかかる場合がある）
        let attempts = 0;
        const checkLiff = setInterval(() => {
          attempts++;
          if (window.liff) {
            console.log('LIFF SDK loaded after', attempts * 100, 'ms');
            clearInterval(checkLiff);
            initLiff();
          } else if (attempts > 100) {
            // 10秒経過
            console.error('LIFF SDK loading timeout');
            clearInterval(checkLiff);
            setStatus('error');
            setErrorMessage('LIFF SDKの読み込みに失敗しました。ページを再読み込みしてください。');
          }
        }, 100);
      }
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
