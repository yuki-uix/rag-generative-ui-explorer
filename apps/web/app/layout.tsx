import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lattice — RAG Knowledge Explorer',
  description: 'A generative UI prototype for exploring grounded RAG knowledge.',
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
