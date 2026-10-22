import { env } from 'cloudflare:workers';
import bundle from '../../../fixtures/retrieval-bundle.json';

/** Capability probe only. Never return credentials or provider diagnostics. */
export function GET() {
  const apiKey = (env as Record<string, unknown>)['DEEPSEEK_API_KEY'];
  return Response.json(
    {
      service: 'rag-generative-ui-explorer',
      liveCardsConfigured:
        typeof apiKey === 'string' && apiKey.trim().length > 0,
      retrieval: 'lexical-bm25',
      corpusVersion: bundle.corpusVersion,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
