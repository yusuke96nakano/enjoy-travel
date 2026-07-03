import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Travel AI",
  description: "出張報告・旅費申請MVP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
