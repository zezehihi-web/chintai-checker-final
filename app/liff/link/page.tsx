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

// GA4イベント送信ヘルパー関数
const trackButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
  if (typeof window !== 'undefined' && window.gtag) {
    const button = event.currentTarget;
    
    // 1. innerTextまたはtextContentからテキストを取得
    let buttonLabel = button.innerText || button.textContent || '';
    
    // 2. 改行や余分な空白を削除（トリム）
    buttonLabel = buttonLabel.trim().replace(/\s+/g, ' ');
    
    // 3. テキストがない場合はaria-label、それもなければidをフォールバック
    if (!buttonLabel) {
      buttonLabel = button.getAttribute('aria-label') || button.id || 'ボタン';
    }
    
    window.gtag('event', 'click_button', {
      event_category: 'engagement',
      event_label: buttonLabel,
    });
  }
};

// LIFF型定義（簡易版）
declare global {
  interface Window {
    liff: {
      init: (config: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      getAccessToken: () => string | null;
      sendMessages: (messages: unknown[]) => Promise<void>;
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

  const getErrorMessageText = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'エラーが発生しました';
  };

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
        // 友だち追加が必要なエラーの場合
        if (data.requires_friend_add) {
          setStatus('need_friend_add');
          return;
        }
        throw new Error(data.error || 'サーバーエラー');
      }

      // 友だち追加が必要な場合（連携は成功しているがメッセージ送信がスキップされた）
      if (data.requires_friend_add) {
        setStatus('need_friend_add');
        return;
      }

      console.log('Link successful!');
      setStatus('success');

      // ウィンドウを閉じる（2秒後）
      setTimeout(() => {
        window.liff.closeWindow();
      }, 2000);
    } catch (error: unknown) {
      console.error('Link error:', error);
      setStatus('error');
      setErrorMessage(getErrorMessageText(error));
    }
  };

  // 友だち追加後の自動チェック用のuseEffect
  useEffect(() => {
    if (status !== 'need_friend_add' || !caseToken) return;

    // ページがフォーカスされたとき（友だち追加から戻ってきたとき）に自動チェック
    const checkFriendshipOnFocus = async () => {
      if (!window.liff) return;

      try {
        console.log('Checking friendship status after friend add...');
        const friendship = await window.liff.getFriendship();
        console.log('Friendship status after check:', friendship);

        if (friendship.friendFlag) {
          // 友だち追加が確認できたら、自動的に連携処理を実行
          console.log('Friend add confirmed! Auto-linking...');
          await performLinking(caseToken);
        }
      } catch (error: unknown) {
        console.warn('Failed to check friendship on focus:', error);
      }
    };

    // ページが表示されたとき（visibilitychange）とフォーカスされたとき（focus）にチェック
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 少し遅延を入れてからチェック（友だち追加処理が完了するのを待つ）
        setTimeout(checkFriendshipOnFocus, 1000);
      }
    };

    const handleFocus = () => {
      // 少し遅延を入れてからチェック
      setTimeout(checkFriendshipOnFocus, 1000);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // 初回チェック（既に友だち追加済みの場合）
    setTimeout(checkFriendshipOnFocus, 2000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [status, caseToken]);

  useEffect(() => {
    async function initLiff() {
      try {
        // 1. LIFF初期化
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
        if (!liffId) {
          throw new Error('LIFF IDが設定されていません');
        }
        console.log('LIFF ID:', liffId);

        console.log('Initializing LIFF with ID:', liffId);
        try {
          await window.liff.init({ liffId });
          console.log('LIFF initialized successfully');
        } catch (initError: unknown) {
          console.error('LIFF init error:', initError);
          throw new Error(`LIFF初期化エラー: ${getErrorMessageText(initError)}`);
        }

        // ログインチェック（iOS対応: 初期化直後はfalseを返すことがあるため、accessTokenで判定）
        const isLoggedIn = window.liff.isLoggedIn();
        const accessTokenCheck = window.liff.getAccessToken();
        console.log('Is logged in:', isLoggedIn);
        console.log('Access token exists:', !!accessTokenCheck);

        // iOS対応: isLoggedInがfalseでもaccessTokenがあればログイン済みとみなす
        if (!isLoggedIn && !accessTokenCheck) {
          throw new Error('LINEにログインしていません');
        }

        // 2. URLからcaseTokenとdiag_id取得
        const params = new URLSearchParams(window.location.search);
        const token = params.get('state');
        const diagId = params.get('diag_id');

        if (!token) {
          throw new Error('リンク情報が見つかりません');
        }

        // diag_idが存在する場合はログに記録（デバッグ用）
        if (diagId) {
          console.log('diag_id received:', diagId);
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
        } catch (friendshipError: unknown) {
          console.warn('Failed to check friendship:', friendshipError);
          // 友だち状態の取得に失敗した場合は続行（古いLIFFバージョン対応）
        }

        // 4. 友だちの場合、そのまま連携処理を実行
        await performLinking(token);
      } catch (error: unknown) {
        console.error('LIFF initialization error:', error);
        if (error instanceof Error) {
          console.error('Error stack:', error.stack);
          console.error('Error details:', {
            message: error.message,
            name: error.name,
            cause: (error as { cause?: unknown }).cause,
          });
        }
        setStatus('error');
        setErrorMessage(getErrorMessageText(error));
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
    <div className="min-h-dvh bg-white flex items-center justify-center p-6">
      <div className="bg-white border-2 border-gray-200 shadow-xl rounded-3xl p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="mb-6">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600"></div>
            </div>
            <h2 className="text-xl font-bold mb-2 text-slate-800">連携中...</h2>
            <p className="text-sm text-gray-600">
              LINEアカウントと案件を紐づけています
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mb-6">
              <div className="text-6xl" aria-hidden="true">✅</div>
            </div>
            <h2 className="text-xl font-bold mb-2 text-slate-800">連携完了！</h2>
            <p className="text-sm text-gray-600">
              LINEに診断結果を送信しました。
              <br />
              このウィンドウは自動的に閉じます。
            </p>
          </>
        )}

        {status === 'need_friend_add' && (
          <>
            <div className="mb-6">
              <div className="text-6xl" aria-hidden="true">👋</div>
            </div>
            <h2 className="text-xl font-bold mb-4 text-slate-800">まず友だち追加をお願いします</h2>
            <p className="text-sm mb-6 text-gray-600">
              診断結果をLINEに送信するには、<br />
              公式アカウントを友だち追加する必要があります。
            </p>

            <button
              onClick={(e) => {
                trackButtonClick(e);
                const lineUrl = process.env.NEXT_PUBLIC_LINE_URL || 'https://lin.ee/RSEtLGm';
                window.liff.openWindow({
                  url: lineUrl,
                  external: true
                });
              }}
              className="neon-btn-lime block w-full text-white font-bold py-3 px-6 rounded-2xl mb-4 transition-transform hover:scale-105"
            >
              <span className="flex items-center justify-center gap-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2C6.48 2 2 5.56 2 10.1c0 2.45 1.3 4.63 3.4 6.1-.15.8-.5 2.15-.56 2.47-.05.24.1.47.34.47.1 0 .2-.03.27-.08.05-.03 2.6-1.73 3.63-2.45.62.17 1.28.26 1.95.26 5.52 0 10-3.56 10-8.1S17.52 2 12 2z"/>
                </svg>
                友だち追加する
              </span>
            </button>

            <p className="text-xs mb-4 text-gray-600">
              友だち追加が完了すると、<br />
              自動的に診断結果を送信します
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mb-6">
              <div className="text-6xl" aria-hidden="true">❌</div>
            </div>
            <h2 className="text-xl font-bold mb-2 text-slate-800">エラー</h2>
            <p className="text-sm mb-4 text-gray-600">{errorMessage}</p>
            <p className="text-xs text-gray-500">
              診断画面に戻って、もう一度「LINEで続き」ボタンを押してください。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
