import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EBC 三垭口大环线｜8–13 天路线规划器',
  description: '基于两步路实走 KML 的 EBC 三垭口 8–13 天路线、海拔与住宿规划。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
