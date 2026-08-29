/**
 * The evaluation question set — the source of truth for the labels.
 *
 * Golden evidence is written as a structural reference (note, section slug,
 * chunk index) rather than as an evidence identifier. Identifiers carry a
 * content hash, so editing a paragraph moves one, and labels written as
 * identifiers would need re-checking by hand after every corpus edit. A
 * structural reference survives an edit and fails loudly on a rename.
 *
 * `questions.jsonl` is generated from this file with the identifiers resolved.
 * Run `pnpm eval:build` after changing either this file or the corpus, and
 * commit both; `pnpm eval:validate` fails on drift.
 *
 * The labels exist before the system does, deliberately. Card-type selection
 * accuracy and Recall@K are scored against them, and ground truth written
 * after the thing it measures is ground truth shaped by the results.
 */

export interface GoldenEvidenceRef {
  documentId: string;
  /** The `##` heading slug, or `body` for text before the first heading. */
  section: string;
  /** Zero-based position within the section; omitted means the first chunk. */
  chunkIndex?: number;
}

export interface QuestionSpec {
  id: string;
  question: string;
  domain: 'rag' | 'generative-ui' | 'intersection';
  /**
   * A set, not a single value. Several questions legitimately admit more than
   * one good presentation, and scoring against one arbitrary choice would
   * count a defensible answer as wrong.
   */
  expectedCardTypes: string[];
  goldenEvidence: GoldenEvidenceRef[];
  /** True for questions the corpus deliberately cannot answer. */
  expectInsufficient: boolean;
}

export const LABELLED_BY = 'yuki-uix';
export const LABELLED_ON = '2026-08-29';

export const QUESTIONS: QuestionSpec[] = [
  {
    id: "rag-001",
    question: "What is retrieval-augmented generation?",
    domain: "rag",
    expectedCardTypes: ["definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/rag-motivation", section: "body" },
      { documentId: "rag/rag-motivation", section: "the-distinction-the-paper-draws" },
      { documentId: "rag/rag-motivation", section: "the-architecture" },
    ],
  },
  {
    id: "rag-002",
    question: "What is BM25 and what does it actually compute?",
    domain: "rag",
    expectedCardTypes: ["definition", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/sparse-retrieval", section: "body" },
      { documentId: "rag/sparse-retrieval", section: "what-bm25-actually-computes" },
    ],
  },
  {
    id: "rag-003",
    question: "How does sparse retrieval differ from dense retrieval?",
    domain: "rag",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/sparse-retrieval", section: "why-it-survives" },
      { documentId: "rag/sparse-retrieval", section: "where-it-fails" },
      { documentId: "rag/dense-retrieval", section: "where-it-fails" },
      { documentId: "rag/dense-retrieval", section: "the-dual-encoder" },
    ],
  },
  {
    id: "rag-004",
    question: "How does a dual encoder retrieve passages?",
    domain: "rag",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/dense-retrieval", section: "the-dual-encoder" },
      { documentId: "rag/dense-retrieval", section: "what-training-is-doing" },
    ],
  },
  {
    id: "rag-005",
    question: "Why does reciprocal rank fusion use rank position instead of score?",
    domain: "rag",
    expectedCardTypes: ["mechanism", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/candidate-fusion", section: "the-problem-with-combining-scores" },
      { documentId: "rag/candidate-fusion", section: "reciprocal-rank-fusion" },
    ],
  },
  {
    id: "rag-006",
    question: "What is the difference between fusion and reranking?",
    domain: "rag",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/candidate-fusion", section: "fusion-is-not-reranking" },
      { documentId: "rag/reranking", section: "cross-encoder-versus-dual-encoder" },
    ],
  },
  {
    id: "rag-007",
    question: "Can reranking improve recall?",
    domain: "rag",
    expectedCardTypes: ["definition", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/reranking", section: "reranking-cannot-raise-recall" },
    ],
  },
  {
    id: "rag-008",
    question: "How do I decide whether reranking is worth its latency?",
    domain: "rag",
    expectedCardTypes: ["procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/reranking", section: "deciding-whether-it-is-worth-it" },
      { documentId: "rag/reranking", section: "what-this-means-here" },
    ],
  },
  {
    id: "rag-010",
    question: "Why does chunk size matter for retrieval?",
    domain: "rag",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/ingestion-and-chunking", section: "the-chunk-is-the-unit-of-retrieval-and-of-citation" },
      { documentId: "rag/ingestion-and-chunking", section: "what-a-chunk-loses-when-it-is-extracted" },
      { documentId: "rag/ingestion-and-chunking", section: "metadata-is-part-of-ingestion" },
    ],
  },
  {
    id: "rag-011",
    question: "Why do evidence identifiers need to be stable?",
    domain: "rag",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/ingestion-and-chunking", section: "identity-has-to-be-stable" },
      { documentId: "rag/production-concerns", section: "versioning-is-the-one-that-cannot-be-retrofitted" },
    ],
  },
  {
    id: "rag-012",
    question: "What makes an embedding useful for retrieval, and what does cosine similarity not tell me?",
    domain: "rag",
    expectedCardTypes: ["definition", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/embeddings-and-similarity", section: "cosine-similarity-and-what-it-does-not-say" },
      { documentId: "rag/embeddings-and-similarity", section: "embeddings-are-trained-for-a-comparison" },
      { documentId: "rag/embeddings-and-similarity", section: "embeddings-are-trained-for-a-comparison", chunkIndex: 1 },
      { documentId: "rag/dense-retrieval", section: "the-dependency-nobody-sees-until-it-moves" },
      { documentId: "rag/embeddings-and-similarity", section: "dimensionality-and-cost" },
    ],
  },
  {
    id: "rag-015",
    question: "Compare rewriting, decomposition, and expansion as query transformations.",
    domain: "rag",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/query-transformation", section: "the-three-transformations" },
      { documentId: "rag/query-transformation", section: "what-each-one-can-break" },
      { documentId: "rag/query-transformation", section: "why-the-raw-question-underperforms" },
    ],
  },
  {
    id: "rag-017",
    question: "Where should retrieved evidence sit in the prompt?",
    domain: "rag",
    expectedCardTypes: ["mechanism", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/context-assembly", section: "position-is-not-neutral" },
      { documentId: "rag/context-assembly", section: "more-context-is-not-more-information" },
      { documentId: "rag/context-assembly", section: "what-assembly-has-to-preserve" },
    ],
  },
  {
    id: "rag-019",
    question: "What are the main failure modes of a RAG pipeline?",
    domain: "rag",
    expectedCardTypes: ["comparison", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/failure-modes", section: "retrieval-miss" },
      { documentId: "rag/failure-modes", section: "lost-context" },
      { documentId: "rag/failure-modes", section: "conflicting-sources" },
      { documentId: "rag/failure-modes", section: "unsupported-synthesis" },
    ],
  },
  {
    id: "rag-020",
    question: "How do I tell a retrieval miss apart from the model ignoring what it retrieved?",
    domain: "rag",
    expectedCardTypes: ["procedure", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/failure-modes", section: "retrieval-miss" },
      { documentId: "rag/failure-modes", section: "lost-context" },
      { documentId: "rag/failure-modes", section: "distinguishing-them" },
    ],
  },
  {
    id: "rag-021",
    question: "What do Recall@K, MRR, and nDCG each measure?",
    domain: "rag",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/retrieval-metrics", section: "recall-k" },
      { documentId: "rag/retrieval-metrics", section: "mean-reciprocal-rank" },
      { documentId: "rag/retrieval-metrics", section: "graded-relevance-and-ndcg" },
      { documentId: "rag/retrieval-metrics", section: "choosing-among-them" },
    ],
  },
  {
    id: "rag-022",
    question: "How is faithfulness different from answer relevance?",
    domain: "rag",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/answer-quality-evaluation", section: "three-questions-not-one" },
    ],
  },
  {
    id: "rag-023",
    question: "Why should mechanical checks run before model-graded metrics?",
    domain: "rag",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/answer-quality-evaluation", section: "mechanical-checks-come-first" },
      { documentId: "rag/answer-quality-evaluation", section: "the-metrics-are-model-graded" },
    ],
  },
  {
    id: "rag-024",
    question: "What do multi-hop, corrective, agentic, and graph RAG each add over plain retrieval?",
    domain: "rag",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/advanced-patterns", section: "graph-rag" },
      { documentId: "rag/advanced-patterns", section: "choosing" },
      { documentId: "rag/advanced-patterns", section: "multi-hop" },
      { documentId: "rag/advanced-patterns", section: "corrective-retrieval" },
      { documentId: "rag/advanced-patterns", section: "agentic-rag" },
    ],
  },
  {
    id: "rag-025",
    question: "Which production concerns shape a corpus-backed retrieval system?",
    domain: "rag",
    expectedCardTypes: ["comparison", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/production-concerns", section: "versioning-is-the-one-that-cannot-be-retrofitted" },
      { documentId: "rag/production-concerns", section: "cache-invalidation" },
      { documentId: "rag/production-concerns", section: "freshness-and-staleness" },
      { documentId: "rag/production-concerns", section: "latency-and-where-it-is-spent" },
      { documentId: "rag/production-concerns", section: "observability" },
      { documentId: "rag/production-concerns", section: "access-control" },
    ],
  },
  {
    id: "rag-026",
    question: "How should a grounded answer distinguish a quotation from an inference?",
    domain: "rag",
    expectedCardTypes: ["mechanism", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/grounded-generation", section: "labelling-what-kind-of-statement-it-is" },
      { documentId: "rag/grounded-generation", section: "citation-granularity" },
    ],
  },
  {
    id: "rag-027",
    question: "Where should a claim of support be checked - in the model or outside it?",
    domain: "rag",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "rag/grounded-generation", section: "where-the-claim-gets-checked" },
      { documentId: "rag/grounded-generation", section: "retrieval-as-a-decision-not-a-fixed-step" },
    ],
  },
  {
    id: "gui-001",
    question: "What is generative UI?",
    domain: "generative-ui",
    expectedCardTypes: ["definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/what-generative-ui-is", section: "body" },
      { documentId: "generative-ui/what-generative-ui-is", section: "a-spectrum-not-a-category" },
      { documentId: "generative-ui/what-generative-ui-is", section: "what-changes-along-the-spectrum" },
      { documentId: "generative-ui/what-generative-ui-is", section: "the-distinction-the-term-obscures" },
    ],
  },
  {
    id: "gui-003",
    question: "What are the levels of UI generation?",
    domain: "generative-ui",
    expectedCardTypes: ["comparison", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/levels-of-generation", section: "content" },
      { documentId: "generative-ui/levels-of-generation", section: "component" },
      { documentId: "generative-ui/levels-of-generation", section: "layout" },
      { documentId: "generative-ui/levels-of-generation", section: "behaviour" },
      { documentId: "generative-ui/levels-of-generation", section: "whole-application" },
    ],
  },
  {
    id: "gui-005",
    question: "How does design-time generation differ from runtime generation?",
    domain: "generative-ui",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/design-time-and-runtime-generation", section: "design-time-versus-runtime" },
      { documentId: "generative-ui/design-time-and-runtime-generation", section: "what-partial-runtime-generation-buys" },
    ],
  },
  {
    id: "gui-006",
    question: "How did interface generation work before language models?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/design-time-and-runtime-generation", section: "interface-generation-as-optimisation" },
      { documentId: "generative-ui/design-time-and-runtime-generation", section: "what-is-genuinely-different-now" },
    ],
  },
  {
    id: "gui-007",
    question: "What is a component registry?",
    domain: "generative-ui",
    expectedCardTypes: ["definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/component-registries", section: "body" },
      { documentId: "generative-ui/component-registries", section: "the-shape-of-the-pattern" },
    ],
  },
  {
    id: "gui-008",
    question: "How do I keep a component lookup closed rather than dynamic?",
    domain: "generative-ui",
    expectedCardTypes: ["procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/component-registries", section: "closed-lookup-not-dynamic-resolution" },
    ],
  },
  {
    id: "gui-009",
    question: "What can a component registry not protect against?",
    domain: "generative-ui",
    expectedCardTypes: ["definition", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/component-registries", section: "what-the-registry-cannot-fix" },
      { documentId: "generative-ui/component-registries", section: "the-registry-is-a-vocabulary" },
    ],
  },
  {
    id: "gui-010",
    question: "What can a declarative UI schema enforce, and what can it not?",
    domain: "generative-ui",
    expectedCardTypes: ["comparison", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/declarative-ui-schemas", section: "what-a-schema-can-enforce" },
      { documentId: "generative-ui/declarative-ui-schemas", section: "grammar-size" },
    ],
  },
  {
    id: "gui-011",
    question: "Why do declarative UI formats send intent rather than appearance?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/declarative-ui-schemas", section: "intent-not-appearance" },
    ],
  },
  {
    id: "gui-013",
    question: "Why is streaming a validated structure harder than streaming text?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/streaming-and-incremental-rendering", section: "text-streams-structure-does-not" },
      { documentId: "generative-ui/streaming-and-incremental-rendering", section: "retraction-is-the-cost-people-underestimate" },
    ],
  },
  {
    id: "gui-014",
    question: "What is the difference between streaming content and streaming status?",
    domain: "generative-ui",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/streaming-and-incremental-rendering", section: "streaming-status-is-not-streaming-content" },
      { documentId: "generative-ui/streaming-and-incremental-rendering", section: "text-streams-structure-does-not" },
    ],
  },
  {
    id: "gui-015",
    question: "What state must survive when a generated interface is regenerated?",
    domain: "generative-ui",
    expectedCardTypes: ["definition", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/state-continuity", section: "the-distinction-to-hold" },
      { documentId: "generative-ui/state-continuity", section: "why-it-gets-lost-by-default" },
      { documentId: "generative-ui/state-continuity", section: "the-problem-in-its-simplest-form" },
      { documentId: "generative-ui/state-continuity", section: "state-as-a-protocol-concern-not-an-application-one" },
    ],
  },
  {
    id: "gui-017",
    question: "What are the principles of mixed-initiative interaction?",
    domain: "generative-ui",
    expectedCardTypes: ["definition", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/mixed-initiative-interaction", section: "the-principles-that-transfer" },
      { documentId: "generative-ui/mixed-initiative-interaction", section: "the-principles-that-transfer", chunkIndex: 1 },
      { documentId: "generative-ui/mixed-initiative-interaction", section: "applied-to-generated-interfaces" },
    ],
  },
  {
    id: "gui-018",
    question: "Compare AG-UI, A2UI, and MCP Apps.",
    domain: "generative-ui",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/agent-ui-protocols", section: "the-layers" },
      { documentId: "generative-ui/agent-ui-protocols", section: "the-layers", chunkIndex: 1 },
      { documentId: "generative-ui/agent-ui-protocols", section: "the-bet-each-one-makes" },
      { documentId: "generative-ui/agent-ui-protocols", section: "why-the-event-model-matters" },
    ],
  },
  {
    id: "gui-019",
    question: "What are the MCP Apps design decisions, and what argument does each rest on?",
    domain: "generative-ui",
    expectedCardTypes: ["comparison", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/mcp-apps-design", section: "predeclared-resources-rather-than-inline-embedding" },
      { documentId: "generative-ui/mcp-apps-design", section: "reusing-json-rpc-rather-than-a-custom-protocol" },
      { documentId: "generative-ui/mcp-apps-design", section: "html-only-deliberately" },
      { documentId: "generative-ui/mcp-apps-design", section: "the-security-model" },
    ],
  },
  {
    id: "gui-020",
    question: "How is model-generated HTML contained in a browser?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/sandboxed-html-generation", section: "what-the-browser-provides" },
      { documentId: "generative-ui/sandboxed-html-generation", section: "what-a-specification-for-this-looks-like" },
    ],
  },
  {
    id: "gui-021",
    question: "What does a sandbox not give back?",
    domain: "generative-ui",
    expectedCardTypes: ["definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/sandboxed-html-generation", section: "what-no-sandbox-gives-back" },
    ],
  },
  {
    id: "gui-022",
    question: "Why is accessibility a property of the component vocabulary rather than of a rendering?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/accessibility-of-generated-interfaces", section: "why-the-level-of-generation-decides-the-outcome" },
      { documentId: "generative-ui/accessibility-of-generated-interfaces", section: "semantics-are-what-assistive-technology-reads" },
      { documentId: "generative-ui/accessibility-of-generated-interfaces", section: "what-generation-still-breaks-in-a-bounded-vocabulary" },
    ],
  },
  {
    id: "gui-023",
    question: "How should a generated interface be evaluated?",
    domain: "generative-ui",
    expectedCardTypes: ["comparison", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/evaluating-generated-interfaces", section: "three-kinds-of-measurement" },
      { documentId: "generative-ui/evaluating-generated-interfaces", section: "the-metrics-that-matter-and-what-each-is-for" },
      { documentId: "generative-ui/evaluating-generated-interfaces", section: "the-comparison-has-to-be-designed-not-assembled" },
    ],
  },
  {
    id: "gui-024",
    question: "Why is a per-response interface harder to learn than a fixed one?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/predictability-and-user-control", section: "learning-requires-repetition" },
      { documentId: "generative-ui/predictability-and-user-control", section: "control-has-to-be-cheap-and-obvious" },
    ],
  },
  {
    id: "gui-025",
    question: "Can a table overstate how much the evidence supports?",
    domain: "generative-ui",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "generative-ui/predictability-and-user-control", section: "visual-authority-is-a-claim" },
    ],
  },
  {
    id: "int-001",
    question: "How should retrieved evidence decide which presentation to use?",
    domain: "intersection",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/choosing-a-ui-from-knowledge-structure", section: "two-signals-and-they-disagree" },
      { documentId: "intersection/choosing-a-ui-from-knowledge-structure", section: "when-the-evidence-has-no-usable-shape" },
      { documentId: "intersection/choosing-a-ui-from-knowledge-structure", section: "structure-is-not-in-the-text" },
      { documentId: "intersection/choosing-a-ui-from-knowledge-structure", section: "what-the-citation-work-suggests-about-the-harder-version" },
    ],
  },
  {
    id: "int-002",
    question: "What should the system do when retrieved passages have no usable structure?",
    domain: "intersection",
    expectedCardTypes: ["procedure", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/choosing-a-ui-from-knowledge-structure", section: "when-the-evidence-has-no-usable-shape" },
      { documentId: "intersection/not-overstating-weak-evidence", section: "where-the-interface-has-to-be-willing-to-look-worse" },
    ],
  },
  {
    id: "int-003",
    question: "What makes a knowledge card evidence-aware?",
    domain: "intersection",
    expectedCardTypes: ["definition", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/evidence-aware-cards", section: "what-evidence-aware-has-to-mean-to-be-worth-anything" },
      { documentId: "intersection/evidence-aware-cards", section: "cheap-traversal-is-the-point" },
    ],
  },
  {
    id: "int-004",
    question: "Does showing citations make an interface verifiable?",
    domain: "intersection",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/evidence-aware-cards", section: "verifiability-is-not-the-presence-of-citations" },
      { documentId: "intersection/not-overstating-weak-evidence", section: "the-failure-the-verifiability-work-predicts" },
    ],
  },
  {
    id: "int-005",
    question: "Compare document-level, sentence-level, and field-level citation.",
    domain: "intersection",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/field-level-citation", section: "granularity-and-what-each-level-permits" },
      { documentId: "intersection/field-level-citation", section: "the-property-structure-adds" },
      { documentId: "intersection/field-level-citation", section: "attribution-needs-a-unit-to-attribute" },
    ],
  },
  {
    id: "int-006",
    question: "What does field-level citation still fail to guarantee?",
    domain: "intersection",
    expectedCardTypes: ["definition", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/field-level-citation", section: "what-it-cannot-do" },
    ],
  },
  {
    id: "int-007",
    question: "Which interface actions should trigger new retrieval?",
    domain: "intersection",
    expectedCardTypes: ["comparison", "procedure"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/ui-driven-retrieval", section: "the-division-that-matters" },
      { documentId: "intersection/ui-driven-retrieval", section: "a-ui-action-is-a-better-query-than-a-rephrased-question" },
      { documentId: "intersection/ui-driven-retrieval", section: "constrained-hops-not-an-autonomous-loop" },
      { documentId: "intersection/ui-driven-retrieval", section: "what-a-follow-up-must-not-break" },
    ],
  },
  {
    id: "int-009",
    question: "How is card state preserved when a follow-up runs a new retrieval?",
    domain: "intersection",
    expectedCardTypes: ["procedure", "mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/card-state-across-turns", section: "identity-has-to-survive-the-turn" },
      { documentId: "intersection/card-state-across-turns", section: "evidence-identity-underneath" },
      { documentId: "intersection/card-state-across-turns", section: "three-states-and-only-one-is-disposable" },
    ],
  },
  {
    id: "int-010",
    question: "Why can a structured presentation overstate weak evidence?",
    domain: "intersection",
    expectedCardTypes: ["mechanism"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/not-overstating-weak-evidence", section: "structure-removes-the-hedge" },
      { documentId: "intersection/not-overstating-weak-evidence", section: "calibrated-words-not-calibrated-numbers" },
    ],
  },
  {
    id: "int-011",
    question: "What do the four evaluation arms each isolate?",
    domain: "intersection",
    expectedCardTypes: ["comparison"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/comparing-presentation-modes", section: "four-arms-three-claims" },
      { documentId: "intersection/comparing-presentation-modes", section: "pinning-the-experiment" },
    ],
  },
  {
    id: "int-012",
    question: "Which results should this project expect dynamic cards to lose on?",
    domain: "intersection",
    expectedCardTypes: ["comparison", "definition"],
    expectInsufficient: false,
    goldenEvidence: [
      { documentId: "intersection/comparing-presentation-modes", section: "results-this-project-should-expect-to-lose" },
    ],
  },
  {
    id: "ins-001",
    question: "Which vector database should I use in production, and what does each cost?",
    domain: "rag",
    expectedCardTypes: ["evidence"],
    expectInsufficient: true,
    goldenEvidence: [],
  },
  {
    id: "ins-002",
    question: "What are the current benchmark scores for the leading embedding models?",
    domain: "rag",
    expectedCardTypes: ["evidence"],
    expectInsufficient: true,
    goldenEvidence: [],
  },
  {
    id: "ins-003",
    question: "How do I configure pgvector index parameters for a million-document corpus?",
    domain: "rag",
    expectedCardTypes: ["procedure", "evidence"],
    expectInsufficient: true,
    goldenEvidence: [],
  },
  {
    id: "ins-004",
    question: "Which React state management library should this project use?",
    domain: "generative-ui",
    expectedCardTypes: ["evidence"],
    expectInsufficient: true,
    goldenEvidence: [],
  },
  {
    id: "ins-005",
    question: "What conversion rate do generative interfaces achieve in e-commerce checkout?",
    domain: "generative-ui",
    expectedCardTypes: ["evidence"],
    expectInsufficient: true,
    goldenEvidence: [],
  },
  {
    id: "ins-006",
    question: "What did the usability study of this system find about card comprehension?",
    domain: "intersection",
    expectedCardTypes: ["evidence"],
    expectInsufficient: true,
    goldenEvidence: [],
  }
];
