import type { Metadata } from "next";
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
      <body className="font-sans antialiased bg-[#02060D]">{children}</body>
    </html>
  );
}