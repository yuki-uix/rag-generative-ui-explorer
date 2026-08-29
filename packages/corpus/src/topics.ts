import { z } from 'zod';
import { KnowledgeDomain } from './domain.js';

/**
 * The controlled topic vocabulary. Note `tags` must come from this list.
 *
 * Free-form tags would make the corpus-coverage criterion in M0.5–M0.7 ("every
 * Domain A topic is covered by at least one note") uncomputable: with forty
 * notes carrying ad-hoc tags, coverage can only be established by reading all
 * forty. Fixing the vocabulary now is cheap; retagging forty notes later is not.
 *
 * `label` is the exact bullet text from docs/KNOWLEDGE_SCOPE.md.
 * `topics.test.ts` parses that document and asserts the two agree in both
 * directions, so a topic added to the scope without an id here fails, and an id
 * here with no scope entry fails too.
 */
export interface Topic {
  id: string;
  domain: KnowledgeDomain;
  label: string;
}

export const TOPICS = [
  { id: 'rag-motivation', domain: 'rag', label: 'RAG motivation and core architecture.' },
  { id: 'ingestion-chunking', domain: 'rag', label: 'Ingestion, parsing, chunking, and metadata.' },
  { id: 'retrieval-strategies', domain: 'rag', label: 'Sparse, dense, and hybrid retrieval.' },
  { id: 'embeddings-similarity', domain: 'rag', label: 'Embeddings and similarity measures.' },
  { id: 'query-transformation', domain: 'rag', label: 'Query rewriting, decomposition, and expansion.' },
  { id: 'reranking-fusion', domain: 'rag', label: 'Reranking and candidate fusion.' },
  { id: 'context-assembly', domain: 'rag', label: 'Context assembly and prompt construction.' },
  { id: 'grounded-generation', domain: 'rag', label: 'Grounded generation and citation design.' },
  {
    id: 'rag-failure-modes',
    domain: 'rag',
    label:
      'Failure modes: retrieval miss, lost context, conflicting sources, and unsupported synthesis.',
  },
  {
    id: 'rag-evaluation',
    domain: 'rag',
    label:
      'Evaluation: Recall@K, MRR, nDCG, faithfulness, citation precision, answer completeness, and end-to-end task success.',
  },
  {
    id: 'advanced-rag-patterns',
    domain: 'rag',
    label:
      'Advanced patterns: multi-hop, corrective RAG, agentic RAG, GraphRAG, and multimodal RAG.',
  },
  {
    id: 'rag-production',
    domain: 'rag',
    label:
      'Production concerns: freshness, versioning, access control, latency, cost, observability, and cache invalidation.',
  },

  {
    id: 'genui-definitions',
    domain: 'generative-ui',
    label: 'Definitions and boundaries of Generative UI.',
  },
  {
    id: 'design-time-vs-runtime',
    domain: 'generative-ui',
    label: 'Design-time generation versus runtime generation.',
  },
  {
    id: 'generation-levels',
    domain: 'generative-ui',
    label: 'Content, component, layout, behavior, and full-application generation.',
  },
  {
    id: 'component-registries',
    domain: 'generative-ui',
    label: 'Component registries and tool-to-component mapping.',
  },
  {
    id: 'declarative-ui-schemas',
    domain: 'generative-ui',
    label: 'Declarative UI schemas and UI grammars.',
  },
  {
    id: 'streaming-rendering',
    domain: 'generative-ui',
    label: 'Streaming and incremental rendering.',
  },
  {
    id: 'state-continuity',
    domain: 'generative-ui',
    label: 'State continuity and malleable interfaces.',
  },
  {
    id: 'mixed-initiative',
    domain: 'generative-ui',
    label: 'Mixed-initiative interaction and human-in-the-loop workflows.',
  },
  {
    id: 'agent-ui-protocols',
    domain: 'generative-ui',
    label: 'Agent–UI protocols, including AG-UI, A2UI, and MCP Apps.',
  },
  {
    id: 'sandboxed-html',
    domain: 'generative-ui',
    label: 'Sandboxed open-ended HTML generation.',
  },
  {
    id: 'genui-quality-attributes',
    domain: 'generative-ui',
    label: 'Security, accessibility, predictability, latency, and user control.',
  },
  {
    id: 'genui-evaluation',
    domain: 'generative-ui',
    label:
      'Evaluation: task completion, correction rate, comprehension, consistency, accessibility, and user preference.',
  },

  {
    id: 'ui-from-knowledge-structure',
    domain: 'intersection',
    label: 'Choosing a UI based on retrieved knowledge structure.',
  },
  {
    id: 'evidence-aware-cards',
    domain: 'intersection',
    label: 'Evidence-aware knowledge cards.',
  },
  {
    id: 'field-level-citation',
    domain: 'intersection',
    label: 'Claim-level and field-level citations.',
  },
  {
    id: 'ui-driven-retrieval',
    domain: 'intersection',
    label: 'Interactive follow-up retrieval from UI actions.',
  },
  {
    id: 'card-state-continuity',
    domain: 'intersection',
    label: 'Preserving card state across retrieval turns.',
  },
  {
    id: 'presentation-comparison',
    domain: 'intersection',
    label: 'Comparing Markdown, fixed cards, and dynamically selected cards.',
  },
  {
    id: 'evidence-strength-honesty',
    domain: 'intersection',
    label: 'Preventing generated presentation from overstating weak evidence.',
  },
] as const satisfies readonly Topic[];

export type TopicId = (typeof TOPICS)[number]['id'];

export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((topic) => topic.id);

export const TopicId = z.enum(TOPIC_IDS as unknown as [TopicId, ...TopicId[]]);

export function topicsForDomain(domain: KnowledgeDomain): readonly Topic[] {
  return TOPICS.filter((topic) => topic.domain === domain);
}
