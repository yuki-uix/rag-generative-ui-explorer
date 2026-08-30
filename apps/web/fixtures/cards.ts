import type { KnowledgeCard } from '@rgux/contracts';

/**
 * Fixtures for the card gallery and the component tests.
 *
 * Two rules these follow, because #49 broke both and the corpus is the whole
 * point of the project:
 *
 * 1. Every evidence identifier is real. Check any of them with
 *    `pnpm corpus:chunks`.
 * 2. The grounding mode tells the truth about the text. `extractive` is used
 *    only where the sentence is lifted from the note unchanged; text that was
 *    compressed is `summarized`; a claim the corpus supports but does not state
 *    is `inferred`. Mislabelling here would make the mode indicator — the thing
 *    grounding rule 5 exists for — decorative.
 */
export const CARD_FIXTURES: readonly KnowledgeCard[] = [
  {
    id: 'fixture-definition',
    type: 'definition',
    title: 'Sparse retrieval',
    definition: {
      text: 'Sparse retrieval scores a document by the query terms it literally contains.',
      mode: 'extractive',
      evidenceIds: ['rag/sparse-retrieval#body#0-d441a718'],
    },
    keyPoints: [
      {
        text: 'The representation is a vector over the vocabulary, almost all of whose entries are zero',
        mode: 'extractive',
        evidenceIds: ['rag/sparse-retrieval#body#0-d441a718'],
      },
      {
        text: 'Matching is a lookup in an inverted index rather than a distance computation in a learned space.',
        mode: 'extractive',
        evidenceIds: ['rag/sparse-retrieval#body#0-d441a718'],
      },
      {
        text: 'BM25 combines inverse document frequency, term frequency saturated through k1, and length normalisation damped by b.',
        mode: 'summarized',
        evidenceIds: ['rag/sparse-retrieval#what-bm25-actually-computes#0-b5dccaa4'],
      },
    ],
  },
  {
    id: 'fixture-comparison',
    type: 'comparison',
    title: 'Sparse versus dense retrieval',
    entities: ['Sparse (BM25)', 'Dense (dual encoder)'],
    rows: [
      {
        dimension: 'Matches on',
        values: [
          {
            text: 'terms the document literally contains',
            mode: 'summarized',
            evidenceIds: ['rag/sparse-retrieval#body#0-d441a718'],
          },
          {
            text: 'proximity in a learned vector space',
            mode: 'summarized',
            evidenceIds: ['rag/dense-retrieval#body#0-9e7f8fbc'],
          },
        ],
      },
      {
        dimension: 'Fails on',
        values: [
          {
            text: 'paraphrase; vocabulary mismatch',
            mode: 'summarized',
            evidenceIds: ['rag/sparse-retrieval#where-it-fails#0-e2e9969a'],
          },
          {
            text: 'rare terms; negation and small distinguishing words',
            mode: 'summarized',
            evidenceIds: ['rag/dense-retrieval#where-it-fails#0-cd5a43de'],
          },
        ],
      },
      {
        dimension: 'When it misses',
        values: [
          {
            // The corpus makes this claim about lexical retrieval inside the
            // *dense* note, as the contrast that defines dense retrieval's
            // opacity. Citing the sparse note would have been the wrong source
            // for a true sentence — which the id-exists check cannot catch.
            text: 'you can see which term failed to match',
            mode: 'extractive',
            evidenceIds: ['rag/dense-retrieval#where-it-fails#0-cd5a43de'],
          },
          {
            text: 'the vectors were not close, which is not a diagnosis',
            mode: 'extractive',
            evidenceIds: ['rag/dense-retrieval#where-it-fails#0-cd5a43de'],
          },
        ],
      },
    ],
  },
  {
    id: 'fixture-mechanism',
    type: 'mechanism',
    title: 'From question to answer',
    stages: [
      {
        label: 'Transform',
        description: {
          text: 'rewriting produces one better query, decomposition several, expansion adds terms rather than replacing them',
          mode: 'summarized',
          evidenceIds: ['rag/query-transformation#the-three-transformations#0-80c928cf'],
        },
      },
      {
        label: 'Retrieve',
        description: {
          text: 'encode the query, retrieve passages from the index',
          mode: 'summarized',
          evidenceIds: ['rag/rag-motivation#the-architecture#0-974b7d0e'],
        },
      },
      {
        label: 'Rerank',
        description: {
          text: 'retrieval determines what is possible, reranking determines what is sent',
          mode: 'extractive',
          evidenceIds: ['rag/reranking#reranking-cannot-raise-recall#0-8f587090'],
        },
      },
      {
        label: 'Generate',
        description: {
          text: 'condition generation on the query together with the retrieved passages',
          mode: 'extractive',
          evidenceIds: ['rag/rag-motivation#the-architecture#0-974b7d0e'],
        },
      },
    ],
  },
  {
    id: 'fixture-procedure',
    type: 'procedure',
    title: 'Deciding whether reranking pays',
    steps: [
      {
        title: 'Measure the candidate set',
        instruction: {
          text: 'Reranking 100 candidates to pick 10 has room to work. Reranking 12 to pick 10 mostly reorders noise.',
          mode: 'extractive',
          evidenceIds: ['rag/reranking#deciding-whether-it-is-worth-it#0-f1766e2b'],
        },
      },
      {
        title: 'Check the first stage',
        instruction: {
          text: 'A well-fused hybrid retriever leaves less for a reranker to fix.',
          mode: 'extractive',
          evidenceIds: ['rag/reranking#deciding-whether-it-is-worth-it#0-f1766e2b'],
        },
      },
      {
        title: 'Ask whether the consumer is position-sensitive',
        instruction: {
          text: 'A hard cutoff at rank ten makes ordering matter more than a prompt that receives every candidate anyway.',
          mode: 'summarized',
          evidenceIds: ['rag/reranking#deciding-whether-it-is-worth-it#0-f1766e2b'],
        },
      },
      {
        title: 'Report recall separately from nDCG',
        instruction: {
          text: 'Because reranking moves nDCG without moving recall over the candidate set, reporting only nDCG would credit retrieval for a change it did not make.',
          mode: 'inferred',
          evidenceIds: [
            'rag/reranking#reranking-cannot-raise-recall#0-8f587090',
            'rag/retrieval-metrics#recall-k#0-49dcb28d',
          ],
        },
      },
    ],
  },
  {
    id: 'fixture-evidence',
    type: 'evidence',
    title: 'Passages behind this answer',
    evidenceIds: [
      'rag/sparse-retrieval#body#0-d441a718',
      'rag/dense-retrieval#where-it-fails#0-cd5a43de',
      'rag/retrieval-metrics#recall-k#0-49dcb28d',
    ],
  },
];
