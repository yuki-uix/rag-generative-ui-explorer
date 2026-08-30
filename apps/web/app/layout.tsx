import './globals.css';

/**
 * The Next template this scaffold came from imported `Metadata` from `next`,
 * which is not a dependency here — the framework is vinext. Plain elements
 * instead, so the type surface matches what is actually installed.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>rag-generative-ui-explorer</title>
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
