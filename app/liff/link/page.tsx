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
      getFriendship: () => Promise<{ friendFlag: boolean }>;
      openWindow: (params: { url: string; external: boolean }) => void;
    };
  }
}

export default function LiffLinkPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'need_friend_add'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [caseToken, setCaseToken] = useState<string>('');

  // 連携処理を実行する関数
  const performLinking = async (token: string) => {
    try {
      setStatus('loading');

      // accessToken取得
      const accessToken = window.liff.getAccessToken();
      if (!accessToken) {
        throw new Error('認証トークンが取得できません');
      }

      // サーバーに送信
      console.log('Sending request to /api/line/link...');
      const res = await fetch('/api/line/link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caseToken: token }),
      });

      console.log('Response status:', res.status);
      const data = await res.json();
      console.log('Response data:', data);

      if (!res.ok) {
        throw new Error(data.error || 'サーバーエラー');
      }

      console.log('Link successful!');
      setStatus('success');

      // ウィンドウを閉じる（2秒後）
      setTimeout(() => {
        window.liff.closeWindow();
      }, 2000);
    } catch (error: any) {
      console.error('Link error:', error);
      setStatus('error');
      setErrorMessage(error.message || 'エラーが発生しました');
    }
  };

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
        const token = params.get('state');

        if (!token) {
          throw new Error('リンク情報が見つかりません');
        }

        setCaseToken(token);

        // 3. 友だち追加状態をチェック
        console.log('Checking friendship status...');
        try {
          const friendship = await window.liff.getFriendship();
          console.log('Friendship status:', friendship);

          if (!friendship.friendFlag) {
            // 友だち追加が必要
            console.log('User is not a friend yet');
            setStatus('need_friend_add');
            return; // ここで処理を中断
          }

          console.log('User is already a friend');
        } catch (friendshipError: any) {
          console.warn('Failed to check friendship:', friendshipError);
          // 友だち状態の取得に失敗した場合は続行（古いLIFFバージョン対応）
        }

        // 4. 友だちの場合、そのまま連携処理を実行
        await performLinking(token);
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
              LINEに診断結果を送信しました。
              <br />
              このウィンドウは自動的に閉じます。
            </p>
          </>
        )}

        {status === 'need_friend_add' && (
          <>
            <div className="mb-6">
              <div className="text-6xl">👋</div>
            </div>
            <h2 className="text-xl font-bold text-white mb-4">まず友だち追加をお願いします</h2>
            <p className="text-slate-400 text-sm mb-6">
              診断結果をLINEに送信するには、<br />
              公式アカウントを友だち追加する必要があります。
            </p>

            <a
              href="https://lin.ee/Hnl9hkO"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-gradient-to-r from-[#06C755] to-[#05b34c] hover:from-[#05b34c] hover:to-[#04a042] text-white font-bold py-3 px-6 rounded-xl mb-4 transition-all hover:scale-105 shadow-lg"
            >
              <span className="flex items-center justify-center gap-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/>
                </svg>
                友だち追加する
              </span>
            </a>

            <p className="text-slate-400 text-xs mb-4">
              友だち追加が完了したら、下のボタンを押してください
            </p>

            <button
              onClick={() => performLinking(caseToken)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all hover:scale-105 shadow-lg"
            >
              連携を続ける
            </button>
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
