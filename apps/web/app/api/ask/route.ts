import { env } from 'cloudflare:workers';
import type { Evidence } from '@rgux/contracts';
import { BM25Retriever } from '@rgux/corpus/bm25';
import { DEEPSEEK, generateAnswer } from '@rgux/generation';
import bundleJson from '@/fixtures/retrieval-bundle.json';

/**
 * Retrieve, then generate, then stream.
 *
 * Two things this route is careful about.
 *
 * `BM25Retriever` is imported from its own module rather than the package
 * barrel: the barrel re-exports ingestion, which reads `node:fs` and does not
 * exist in workerd, and which `web:bundle:check` bans from the built output for
 * exactly that reason. The retriever itself is pure computation and belongs
 * here.
 *
 * The key comes from a Worker binding, not `process.env`. It is read here and
 * handed to `generateAnswer`; it never reaches the browser, and the retrieval
 * bundle and the model call both stay on this side of the network.
 */
const bundle = bundleJson as unknown as {
  corpusVersion: string;
  retrieval: string;
  evidence: Evidence[];
};

const retriever = new BM25Retriever(bundle.evidence);
const byId = new Map(bundle.evidence.map((item) => [item.id, item]));

export async function POST(request: Request): Promise<Response> {
  const { question } = (await request.json()) as { question?: unknown };

  if (typeof question !== 'string' || question.trim().length === 0) {
    return Response.json({ error: 'A question is required.' }, { status: 400 });
  }

  const apiKey = (env as Record<string, unknown>)['DEEPSEEK_API_KEY'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return Response.json(
      { error: 'The model key is not configured on this deployment.' },
      { status: 503 },
    );
  }

  const retrieved = (await retriever.search(question, 8))
    .map((candidate) => byId.get(candidate.evidenceId))
    .filter((item): item is Evidence => item !== undefined);

  if (retrieved.length === 0) {
    return Response.json({
      corpusVersion: bundle.corpusVersion,
      retrieval: bundle.retrieval,
      incomplete: true,
      reason: 'Retrieval returned nothing for this question, so there is nothing to answer from.',
      evidence: [],
    });
  }

  // Newline-delimited JSON: the answer streams token by token, and the record
  // that follows carries what the reader cannot see — which citations resolved,
  // which were invented, and what the run cost.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encode = (value: unknown) =>
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify(value)}\n`));

      encode({
        type: 'start',
        corpusVersion: bundle.corpusVersion,
        retrieval: bundle.retrieval,
        evidence: retrieved.map((item, index) => ({
          handle: `E${index + 1}`,
          id: item.id,
          documentTitle: item.documentTitle,
          section: item.section,
          text: item.text,
        })),
      });

      try {
        const record = await generateAnswer({
          profile: DEEPSEEK,
          question,
          evidence: retrieved,
          apiKey,
          onDelta: (text) => encode({ type: 'delta', text }),
        });

        encode({
          type: 'done',
          answer: record.answer,
          stopReason: record.stopReason,
          firstTokenMs: record.firstTokenMs,
          latencyMs: record.latencyMs,
          usage: record.usage,
          hadHiddenReasoning: record.hadHiddenReasoning,
        });
      } catch (error) {
        // Reported to the reader rather than swallowed: a stream that just
        // stops is indistinguishable from an answer that ended.
        encode({ type: 'error', message: (error as Error).message });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  });
}
