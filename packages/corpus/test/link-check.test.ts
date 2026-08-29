/**
 * The link checker exists because a syntactically valid URL can still 404. The
 * unit tests use an injected fetch so they stay offline and deterministic; the
 * real network path is exercised by the scheduled workflow, not here.
 */
import { describe, expect, it, vi } from 'vitest';
import { checkLinks } from '../src/link-check.js';
import type { Manifest } from '../src/manifest.js';

const manifest = (urls: Array<string | undefined>): Manifest => ({
  corpusVersion: 'corpus-0123456789ab',
  documentCount: urls.length,
  documents: urls.map((url, index) => ({
    documentId: `rag/note-${index}`,
    path: `knowledge/rag/note-${index}.md`,
    title: `Note ${index}`,
    domain: 'rag',
    sourceType: url === undefined ? 'original' : 'paper',
    author: 'Someone',
    summary: 'A note.',
    ...(url === undefined ? {} : { url }),
    tags: ['x'],
    contentHash: '0123456789abcdef',
    metadataHash: 'fedcba9876543210',
  })),
});

const respond = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

describe('checkLinks', () => {
  it('reports a well-formed URL that does not resolve', async () => {
    const fetchImpl = vi.fn(async () => respond(404));
    const results = await checkLinks(manifest(['https://example.invalid/gone']), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(results).toEqual([
      { documentId: 'rag/note-0', url: 'https://example.invalid/gone', ok: false, status: 404 },
    ]);
  });

  it('reports a reachable URL as ok', async () => {
    const results = await checkLinks(manifest(['https://example.invalid/ok']), {
      fetchImpl: (async () => respond(200)) as unknown as typeof fetch,
    });
    expect(results[0]!.ok).toBe(true);
  });

  it('retries with GET when the host rejects HEAD', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === 'HEAD' ? respond(405) : respond(200),
    );
    const results = await checkLinks(manifest(['https://example.invalid/head-hostile']), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results[0]!.ok).toBe(true);
  });

  it('reports a network failure as unreachable rather than throwing', async () => {
    const results = await checkLinks(manifest(['https://example.invalid/dns-failure']), {
      fetchImpl: (async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      }) as unknown as typeof fetch,
    });

    expect(results[0]).toMatchObject({ ok: false, error: 'getaddrinfo ENOTFOUND' });
  });

  it('skips notes that have no upstream URL', async () => {
    const fetchImpl = vi.fn(async () => respond(200));
    const results = await checkLinks(manifest([undefined, 'https://example.invalid/ok']), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.documentId).toBe('rag/note-1');
  });

  it('checks every URL when there are more of them than workers', async () => {
    const urls = Array.from({ length: 9 }, (_, index) => `https://example.invalid/${index}`);
    const fetchImpl = vi.fn(async () => respond(200));
    const results = await checkLinks(manifest(urls), {
      concurrency: 4,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(9);
    expect(results).toHaveLength(9);
  });
});
