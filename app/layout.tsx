import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PiecePool",
  description: "AI 기반 학습/프로젝트 정보 통합 허브"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
