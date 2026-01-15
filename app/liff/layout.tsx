/**
 * LIFF用レイアウト
 * LIFF SDKを読み込む
 */

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        {/* LIFF SDK - 最新バージョンを使用 */}
        <script 
          src="https://static.line-scdn.net/liff/edge/versions/2.24.0/sdk.js"
          crossOrigin="anonymous"
        ></script>
        {/* フォールバック: 最新版が読み込めない場合 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && !window.liff) {
                console.warn('Primary LIFF SDK failed, trying fallback...');
                const fallbackScript = document.createElement('script');
                fallbackScript.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
                fallbackScript.crossOrigin = 'anonymous';
                document.head.appendChild(fallbackScript);
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
