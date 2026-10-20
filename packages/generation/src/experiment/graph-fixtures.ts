import type { EvalQuestion, Retriever } from '@rgux/corpus';
import { fixtureCompletion, fixtureFetch } from './fixtures.js';
import type { GraphCall, GraphRun } from './graph.js';

export const GRAPH_SCENARIOS = [
  'demo', 'sufficient', 'supplemented', 'still-missing', 'repeated-query', 'no-new-evidence',
  'tool-error', 'supplement-tool-error', 'invalid-reference', 'coverage-invalid',
  'rewrite-invalid', 'conflicting', 'provider-error', 'truncated', 'refusal',
] as const;
export type GraphScenario = (typeof GRAPH_SCENARIOS)[number];

function selectedScenario(scenario: GraphScenario, question: EvalQuestion): GraphScenario {
  if (scenario !== 'demo') return scenario;
  return question.expectInsufficient ? 'still-missing'
    : question.expectedCardTypes.includes('comparison') ? 'supplemented' : 'sufficient';
}

/** Real BM25 candidates, with controlled omissions/failures to test routing.
 * This is a tool fixture, not evidence that a model can judge coverage. */
export function graphFixtureRetriever(base: Retriever, scenario: GraphScenario, question: EvalQuestion): Retriever {
  const selected = selectedScenario(scenario, question);
  let calls = 0;
  let first: Awaited<ReturnType<Retriever['search']>> = [];
  return { async search(query, k) {
    calls++;
    if (selected === 'tool-error' || (selected === 'supplement-tool-error' && calls === 2)) {
      throw Object.assign(new Error('Synthetic retrieval timeout'), { name: 'TimeoutError' });
    }
    if (selected === 'no-new-evidence' && calls === 2) return first;
    const candidates = await base.search(query, k);
    const result = calls === 1 && !['sufficient', 'invalid-reference', 'coverage-invalid', 'conflicting', 'provider-error', 'truncated', 'refusal'].includes(selected)
      ? candidates.slice(0, 2) : candidates;
    if (calls === 1) first = result;
    return result;
  } };
}

/** Both control and generation replies pass through the real LangChain SDK. */
export function graphFixture(kind: GraphCall['kind'], run: GraphRun, scenario: GraphScenario): typeof globalThis.fetch {
  const selected = selectedScenario(scenario, run.question);
  if (kind === 'generation') {
    // A synthetic complete answer even when the label says insufficient: labels
    // must not control the graph's production branch or generator.
    const raw = run.evidence.length === 1 ? JSON.stringify({ cards: [{
      id: 'graph-evidence', type: 'evidence', title: 'Synthetic evidence fixture',
      evidenceIds: [selected === 'invalid-reference' ? 'E999' : 'E1'],
    }], incomplete: false }) : fixtureCompletion({ ...run.question, expectInsufficient: false }, run.evidence,
      selected === 'invalid-reference' ? 'invalid-reference' : 'valid');
    return fixtureFetch(raw, 'valid');
  }
  if (kind === 'rewrite') {
    return fixtureFetch(selected === 'rewrite-invalid' ? '{"query": ""}' : JSON.stringify({
      query: selected === 'repeated-query' ? `  ${run.question.question.toUpperCase()}  `
        : 'dense vector retrieval embeddings similarity BM25 sparse ranking',
    }), 'valid');
  }
  const sufficient = ['sufficient', 'invalid-reference'].includes(selected)
    || (selected === 'supplemented' && run.supplementalRetrievals === 1);
  const status = selected === 'conflicting' ? 'conflicting' : sufficient ? 'sufficient' : 'missing';
  return fixtureFetch(JSON.stringify({
    status,
    missingItems: status === 'missing' ? ['Synthetic coverage gap for routing test'] : [],
    reason: `Synthetic ${status} decision; not a semantic evaluation.`,
    evidenceIds: selected === 'coverage-invalid' ? ['E999']
      : run.evidence.slice(0, 2).map((_, index) => `E${index + 1}`),
  }), selected === 'provider-error' || selected === 'truncated' || selected === 'refusal' ? selected : 'valid');
}
