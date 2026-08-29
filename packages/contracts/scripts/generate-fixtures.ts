import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeEvidenceId } from '../src/evidence-id.js';

const dir = resolve(import.meta.dirname, '../../../schemas/__fixtures__');
const w = (kind: string, name: string, value: unknown) =>
  writeFileSync(resolve(dir, kind, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);

const e1 = makeEvidenceId({ documentId: 'rag/hybrid-retrieval', section: 'Reciprocal rank fusion', chunkIndex: 0, text: 'Reciprocal rank fusion combines ranked candidate lists without needing comparable scores.' });
const e2 = makeEvidenceId({ documentId: 'rag/hybrid-retrieval', section: 'Reciprocal rank fusion', chunkIndex: 1, text: 'Fusion is applied before reranking so the reranker sees candidates from both retrievers.' });
const e3 = makeEvidenceId({ documentId: 'generative-ui/component-registries', chunkIndex: 0, text: 'A component registry maps tool results to reviewed components rather than to generated markup.' });

const ev = (id: string, documentId: string, documentTitle: string, text: string, section?: string) => ({
  id, documentId, documentTitle, ...(section ? { section } : {}), text,
  url: 'https://example.invalid/notes/' + documentId,
  retrievalScore: 0.82, metadata: { category: documentId.split('/')[0] },
});

const evidence = [
  ev(e1, 'rag/hybrid-retrieval', 'Hybrid retrieval', 'Reciprocal rank fusion combines ranked candidate lists without needing comparable scores.', 'Reciprocal rank fusion'),
  ev(e2, 'rag/hybrid-retrieval', 'Hybrid retrieval', 'Fusion is applied before reranking so the reranker sees candidates from both retrievers.', 'Reciprocal rank fusion'),
  ev(e3, 'generative-ui/component-registries', 'Component registries', 'A component registry maps tool results to reviewed components rather than to generated markup.'),
];

const g = (text: string, mode: string, ids: string[]) => ({ text, mode, evidenceIds: ids });
const meta = (extra: Record<string, unknown> = {}) => ({
  knowledgeBaseVersion: 'corpus-2026-08-29-a1b2c3d4',
  generatedAt: '2026-08-29T10:00:00Z',
  incomplete: false,
  ...extra,
});

const definitionCard = {
  id: 'card-1', type: 'definition', title: 'Reciprocal rank fusion',
  definition: g('Reciprocal rank fusion combines ranked candidate lists without needing comparable scores.', 'extractive', [e1]),
  keyPoints: [
    g('Fusion runs before reranking.', 'summarized', [e2]),
    g('It does not require score calibration between retrievers.', 'summarized', [e1]),
  ],
};

const comparisonCard = {
  id: 'card-2', type: 'comparison', title: 'Lexical versus dense retrieval',
  entities: ['Lexical (BM25)', 'Dense (embeddings)'],
  rows: [{
    dimension: 'Strength',
    values: [g('Exact terminology matching.', 'summarized', [e1]), g('Semantic matching across paraphrase.', 'summarized', [e1])],
  }],
};

w('valid', 'definition-response', {
  query: 'What is reciprocal rank fusion?',
  cards: [definitionCard], evidence,
  suggestedActions: [{ id: 'a1', label: 'Show sources', action: 'show_sources', payload: { cardId: 'card-1' } }],
  metadata: meta(),
});

w('valid', 'comparison-response', {
  query: 'Lexical versus dense retrieval',
  cards: [comparisonCard], evidence,
  suggestedActions: [{ id: 'a1', label: 'Add GraphRAG', action: 'add_to_comparison', payload: { cardId: 'card-2', entity: 'GraphRAG' } }],
  metadata: meta(),
});

w('valid', 'incomplete-missing', {
  query: 'What does the corpus say about vector database pricing?',
  cards: [], evidence: [], suggestedActions: [],
  metadata: meta({ incomplete: true, incompleteReason: 'missing' }),
});

w('valid', 'incomplete-conflicting', {
  query: 'Should reranking always be applied?',
  cards: [], evidence, suggestedActions: [],
  metadata: meta({ incomplete: true, incompleteReason: 'conflicting' }),
});

const mechanismCard = {
  id: 'card-3', type: 'mechanism', title: 'How hybrid retrieval assembles candidates',
  stages: [
    { label: 'Retrieve', description: g('Lexical and dense retrievers each return a ranked list.', 'summarized', [e1]) },
    { label: 'Fuse', description: g('Reciprocal rank fusion merges the lists without comparable scores.', 'extractive', [e1]) },
    { label: 'Rerank', description: g('The reranker sees candidates from both retrievers.', 'extractive', [e2]) },
  ],
};

const procedureCard = {
  id: 'card-4', type: 'procedure', title: 'Add a retriever to the fusion stage',
  steps: [
    { title: 'Implement the interface', instruction: g('Return ranked candidates from the new source.', 'inferred', [e2]) },
    { title: 'Register it before fusion', instruction: g('Fusion runs before reranking, so register upstream of it.', 'extractive', [e2]) },
  ],
};

const evidenceCard = {
  id: 'card-5', type: 'evidence', title: 'Sources for hybrid retrieval',
  evidenceIds: [e1, e2, e3],
};

w('valid', 'mechanism-response', {
  query: 'How does hybrid retrieval work?',
  cards: [mechanismCard], evidence,
  suggestedActions: [{ id: 'a1', label: 'Explain fusion in more depth', action: 'explain_further', payload: { cardId: 'card-3', focus: 'reciprocal rank fusion' } }],
  metadata: meta(),
});

w('valid', 'procedure-and-evidence-response', {
  query: 'How do I add a retriever?',
  cards: [procedureCard, evidenceCard], evidence,
  suggestedActions: [
    { id: 'a1', label: 'Show sources', action: 'show_sources', payload: { cardId: 'card-4' } },
    { id: 'a2', label: 'Explain further', action: 'explain_further', payload: { cardId: 'card-4' } },
  ],
  metadata: meta({ generatedAt: '2026-08-29T18:00:00+08:00' }),
});

const base = { query: 'q', cards: [definitionCard], evidence, suggestedActions: [], metadata: meta() };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// Gap 1: incomplete responses must state which situation occurred.
w('invalid', 'incomplete-without-reason', { ...clone(base), metadata: meta({ incomplete: true }) });
w('invalid', 'incomplete-reason-without-flag', { ...clone(base), metadata: meta({ incompleteReason: 'missing' }) });

// Gap 2 and 3: empty arrays validated under the hand-written schema.
const emptyKeyPoints = clone(definitionCard); emptyKeyPoints.keyPoints = [];
w('invalid', 'definition-empty-key-points', { ...clone(base), cards: [emptyKeyPoints] });
const emptyRows = clone(comparisonCard); emptyRows.rows = [];
w('invalid', 'comparison-empty-rows', { ...clone(base), cards: [emptyRows] });

// Gap 4: action payload was previously a free-form object.
w('invalid', 'action-payload-unconstrained', { ...clone(base),
  suggestedActions: [{ id: 'a1', label: 'Show sources', action: 'show_sources', payload: { cardId: 'card-1', arbitraryKey: 'anything at all' } }] });
w('invalid', 'action-payload-missing-card-id', { ...clone(base),
  suggestedActions: [{ id: 'a1', label: 'Show sources', action: 'show_sources', payload: {} }] });
w('invalid', 'action-unknown-kind', { ...clone(base),
  suggestedActions: [{ id: 'a1', label: 'Run it', action: 'execute_code', payload: { cardId: 'card-1' } }] });

// Grounding rule 1 and evidence ID shape.
const noEvidence = clone(definitionCard); noEvidence.definition.evidenceIds = [];
w('invalid', 'grounded-text-without-evidence', { ...clone(base), cards: [noEvidence] });
const dupEvidence = clone(definitionCard); dupEvidence.definition.evidenceIds = [e1, e1];
w('invalid', 'duplicate-evidence-ids', { ...clone(base), cards: [dupEvidence] });
const badId = clone(definitionCard); badId.definition.evidenceIds = ['0000000000000000000000000000000000000000'];
w('invalid', 'malformed-evidence-id', { ...clone(base), cards: [badId] });

// Cross-field rules: not representable in JSON Schema, enforced by Zod only.
const mismatch = clone(comparisonCard); mismatch.entities = ['Lexical (BM25)', 'Dense (embeddings)', 'GraphRAG'];
w('invalid', 'comparison-row-value-mismatch', { ...clone(base), cards: [mismatch] });
const dupIds = clone(definitionCard);
w('invalid', 'duplicate-card-ids', { ...clone(base), cards: [dupIds, clone(definitionCard)] });
w('invalid', 'action-references-unknown-card', { ...clone(base),
  suggestedActions: [{ id: 'a1', label: 'Show sources', action: 'show_sources', payload: { cardId: 'card-999' } }] });

// Upper bounds. None of these were exercised before.
w('invalid', 'too-many-cards', { ...clone(base),
  cards: [1, 2, 3, 4, 5].map((n) => ({ ...clone(definitionCard), id: `card-${n}` })) });
w('invalid', 'too-many-actions', { ...clone(base),
  suggestedActions: [1, 2, 3, 4].map((n) => ({ id: `a${n}`, label: 'Show sources', action: 'show_sources', payload: { cardId: 'card-1' } })) });
const tooManyEntities = clone(comparisonCard);
tooManyEntities.entities = ['BM25', 'Dense', 'GraphRAG', 'Corrective RAG', 'Agentic RAG'];
tooManyEntities.rows[0]!.values = tooManyEntities.entities.map((name: string) => g(`${name} detail.`, 'summarized', [e1]));
w('invalid', 'comparison-too-many-entities', { ...clone(base), cards: [tooManyEntities] });
const singleStage = clone(mechanismCard); singleStage.stages = [clone(mechanismCard.stages[0]!)];
w('invalid', 'mechanism-single-stage', { ...clone(base), cards: [singleStage] });
const tooManySteps = clone(procedureCard);
tooManySteps.steps = Array.from({ length: 11 }, (_, index) => ({
  title: `Step ${index}`, instruction: g(`Do thing ${index}.`, 'summarized', [e2]),
}));
w('invalid', 'procedure-too-many-steps', { ...clone(base), cards: [tooManySteps] });

console.log('fixtures written');
