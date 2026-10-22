import type { Evidence, KnowledgeCard, IncompleteReason } from '@rgux/contracts';

/** JSON transport types. Browser code rechecks cards with gate before rendering. */
export interface LiveCardsRequest {
  question: string;
}

export interface LiveCardsProvenance {
  corpusVersion: string;
  retrieval: 'lexical-bm25';
  retrievalQuery: string;
  queryExpansion: 'technical-terms-v1' | 'none';
  retrievedCount: number;
  indexedChunkCount: number;
  profileId: string;
  model: string;
  promptVersion: string;
  schemaEnforced: boolean;
  /** Web request adapter; the frozen experiment profile remains unchanged. */
  thinking: 'disabled';
  generationVersion: 'live-cards-4';
  generatedAt: string;
  /** Structural/citation checks do not prove a generated claim is factually correct. */
  validation: 'schema-and-citation-checks';
}

export interface LiveCardsUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

export interface LiveCardsTiming {
  retrievalMs: number;
  generationMs: number;
  validationMs: number;
  totalMs: number;
}

export type LiveCardsErrorCode =
  | 'unsupported-content-type'
  | 'invalid-request'
  | 'question-too-long'
  | 'request-too-large'
  | 'model-unavailable'
  | 'model-timeout'
  | 'request-cancelled'
  | 'request-timeout'
  | 'provider-error'
  | 'invalid-model-output'
  | 'generation-truncated'
  | 'generation-refused';

interface LiveCardsBase {
  question: string;
  cards: readonly KnowledgeCard[];
  /** Exact retrieved corpus excerpts, with their actual BM25 scores. */
  evidence: readonly Evidence[];
  provenance: LiveCardsProvenance;
  usage: LiveCardsUsage | null;
  timing: LiveCardsTiming;
}

export interface LiveCardsAnswer extends LiveCardsBase {
  status: 'complete' | 'incomplete';
  incompleteReason?: IncompleteReason;
  message?: string;
}

export interface LiveCardsFailure extends LiveCardsBase {
  status: 'invalid' | 'error';
  code: LiveCardsErrorCode;
  message: string;
}

export type LiveCardsResponse = LiveCardsAnswer | LiveCardsFailure;
