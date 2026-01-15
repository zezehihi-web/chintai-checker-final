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
        {/* LIFF SDK */}
        <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
