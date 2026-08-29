/**
 * The link checker exists because a syntactically valid URL can still 404. The
 * unit tests inject fetch so they stay offline and deterministic; the real
 * network path is exercised by the scheduled workflow, not here.
 */
import { describe, expect, it, vi } from 'vitest';
import { checkLinks } from '../src/link-check.js';
import type { Manifest } from '../src/manifest.js';

const source = (url: string, index: number) => ({
  sourceType: 'paper',
  title: `Source ${index}`,
  url,
  author: 'Someone',
  published: '2020',
  retrieved: '2026-08-28',
  license: 'Short quotations only',
  primary: index === 0,
});

/** One document per entry; each entry is that document's list of source URLs. */
const manifest = (documents: string[][]): Manifest => ({
  corpusVersion: 'corpus-0123456789ab',
  documentCount: documents.length,
  sourceCount: documents.flat().length,
  documents: documents.map((urls, index) => ({
    documentId: `rag/note-${index}`,
    path: `knowledge/rag/note-${index}.md`,
    title: `Note ${index}`,
    domain: 'rag',
    author: 'yuki-uix',
    revised: '2026-08-28',
    summary: 'A note.',
    tags: ['retrieval-strategies'],
    sources: urls.map(source),
    contentHash: '0123456789abcdef',
    metadataHash: 'fedcba9876543210',
  })),
});

const respond = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

describe('checkLinks', () => {
  it('reports a well-formed URL that does not resolve', async () => {
    const results = await checkLinks(manifest([['https://example.invalid/gone']]), {
      fetchImpl: (async () => respond(404)) as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      documentId: 'rag/note-0',
      sourceTitle: 'Source 0',
      ok: false,
      status: 404,
    });
  });

  it('checks every source a note cites, not only its primary', async () => {
    const fetchImpl = vi.fn(async () => respond(200));
    const results = await checkLinks(
      manifest([['https://example.invalid/a', 'https://example.invalid/b']]),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.url)).toEqual([
      'https://example.invalid/a',
      'https://example.invalid/b',
    ]);
  });

  it('retries with GET when the host rejects HEAD', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === 'HEAD' ? respond(405) : respond(200),
    );
    const results = await checkLinks(manifest([['https://example.invalid/head-hostile']]), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results[0]!.ok).toBe(true);
  });

  /**
   * Publishers behind a bot filter answer 403 to an automated request while
   * serving the document to a person. Flagged so it does not read as rot.
   */
  it('marks a persistent 403 as blocked rather than merely failed', async () => {
    const results = await checkLinks(manifest([['https://example.invalid/publisher']]), {
      fetchImpl: (async () => respond(403)) as unknown as typeof fetch,
    });

    expect(results[0]).toMatchObject({ ok: false, status: 403, blocked: true });
  });

  it('reports a network failure as unreachable rather than throwing', async () => {
    const results = await checkLinks(manifest([['https://example.invalid/dns']]), {
      fetchImpl: (async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }) as unknown as typeof fetch,
    });

    expect(results[0]).toMatchObject({ ok: false, error: 'getaddrinfo ENOTFOUND' });
  });

  it('skips notes that cite no sources', async () => {
    const fetchImpl = vi.fn(async () => respond(200));
    const results = await checkLinks(manifest([[], ['https://example.invalid/ok']]), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results[0]!.documentId).toBe('rag/note-1');
  });

  it('checks every URL when there are more of them than workers', async () => {
    const urls = Array.from({ length: 9 }, (_, index) => [`https://example.invalid/${index}`]);
    const fetchImpl = vi.fn(async () => respond(200));
    const results = await checkLinks(manifest(urls), {
      concurrency: 4,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(results).toHaveLength(9);
  });
});
