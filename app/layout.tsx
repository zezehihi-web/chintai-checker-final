import Script from 'next/script'
import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css"; // ★この1行がないと色がつきません！

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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-GWQ33RP00C"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-GWQ33RP00C');
          `}
        </Script>
      </body>
    </html>
  );
}
