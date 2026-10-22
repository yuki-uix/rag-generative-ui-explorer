import './globals.css';

/**
 * The Next template this scaffold came from imported `Metadata` from `next`,
 * which is not a dependency here — the framework is vinext. Plain elements
 * instead, so the type surface matches what is actually installed.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RAG Explorer · 检索、知识卡与可核对的实验</title>
        <meta
          name="description"
          content="浏览 RAG 与 Generative UI 的实现，核对文字、OCR 与 CLIP 图片检索实验的原图、金标和实际排名。"
        />
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
