import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from '@next/third-parties/google'; // ★ここが追加
import "./globals.css";

export const metadata: Metadata = {
  title: "賃貸見積もりチェッカー",
  description: "AIで見積もりを適正診断",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased bg-[#02060D]">
        {children}
        <SpeedInsights />
        <Analytics />
        {/* ★以下の1行だけで設定完了です。IDは間違いなくこれでした */}
        <GoogleAnalytics gaId="G-GWQ33RP00C" /> 
      </body>
    </html>
  );
}