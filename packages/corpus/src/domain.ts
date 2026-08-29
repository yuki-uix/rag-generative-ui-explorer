import { z } from 'zod';

/** The three corpus groups. Also the directory names under `knowledge/`. */
export const KnowledgeDomain = z.enum(['rag', 'generative-ui', 'intersection']);
export type KnowledgeDomain = z.infer<typeof KnowledgeDomain>;

export const KNOWLEDGE_DOMAINS: readonly KnowledgeDomain[] = KnowledgeDomain.options;
