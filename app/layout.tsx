import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from '@next/third-parties/google';
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
      <body className="font-sans antialiased bg-[#FAFAFA]">
        {children}
        <SpeedInsights />
        <Analytics />
        <GoogleAnalytics gaId="G-GWQ33RP00C" /> 
      </body>
    </html>
  );
}