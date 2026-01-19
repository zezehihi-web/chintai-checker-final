/**
 * LIFF用レイアウト
 * LIFF SDKを読み込む
 */

import Script from 'next/script';

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        {/* LIFF SDK - 最新バージョンを使用 */}
        <Script
          src="https://static.line-scdn.net/liff/edge/versions/2.24.0/sdk.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
        {/* フォールバック: 最新版が読み込めない場合 */}
        <Script id="liff-sdk-fallback" strategy="afterInteractive">
          {`
            if (typeof window !== 'undefined' && !window.liff) {
              console.warn('Primary LIFF SDK failed, trying fallback...');
              const fallbackScript = document.createElement('script');
              fallbackScript.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
              fallbackScript.crossOrigin = 'anonymous';
              document.head.appendChild(fallbackScript);
            }
          `}
        </Script>
      </head>
      <body className="theme-neon">{children}</body>
    </html>
  );
}
