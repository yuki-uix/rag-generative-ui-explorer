import type { Manifest } from './manifest.js';

/**
 * Canonical URLs are checked by requesting them, not by validating their syntax.
 * A note can carry a perfectly well-formed URL that 404s, and a syntax check
 * would report the corpus as sound — the failure mode this exists to catch.
 *
 * This runs on its own schedule rather than in the pull-request gate. Requiring
 * a third party's uptime before an unrelated change can merge trades a real
 * check for a flaky one; a weekly run that reports rot is more useful than a
 * merge blocker that people learn to re-run until it passes.
 */

export interface LinkResult {
  documentId: string;
  sourceTitle: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  /**
   * A publisher returning 403 to an automated request is bot policy, not a dead
   * link. Reported separately so a Cloudflare-fronted DOI does not read as rot.
   */
  blocked?: boolean;
}

export interface LinkCheckOptions {
  timeoutMs?: number;
  concurrency?: number;
  fetchImpl?: typeof fetch;
}

async function checkOne(
  documentId: string,
  sourceTitle: string,
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<LinkResult> {
  const attempt = async (method: 'HEAD' | 'GET'): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'rag-generative-ui-explorer link check' },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await attempt('HEAD');
    // Plenty of documentation hosts reject HEAD but serve GET.
    if (response.status === 405 || response.status === 403 || response.status === 501) {
      response = await attempt('GET');
    }
    return {
      documentId,
      sourceTitle,
      url,
      ok: response.ok,
      status: response.status,
      ...(response.status === 403 ? { blocked: true } : {}),
    };
  } catch (error) {
    return { documentId, sourceTitle, url, ok: false, error: (error as Error).message };
  }
}

export async function checkLinks(
  manifest: Manifest,
  options: LinkCheckOptions = {},
): Promise<LinkResult[]> {
  const { timeoutMs = 15_000, concurrency = 4, fetchImpl = fetch } = options;

  const queue = manifest.documents.flatMap((document) =>
    document.sources.map((source) => ({
      documentId: document.documentId,
      sourceTitle: source.title,
      url: source.url,
    })),
  );

  const results: LinkResult[] = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const item = queue[cursor++]!;
      results.push(
        await checkOne(item.documentId, item.sourceTitle, item.url, timeoutMs, fetchImpl),
      );
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

  return results.sort(
    (a, b) => a.documentId.localeCompare(b.documentId) || a.url.localeCompare(b.url),
  );
}
