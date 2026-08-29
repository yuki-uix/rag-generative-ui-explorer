import { z } from 'zod';
import { CARD_TYPES, EVIDENCE_ID_PATTERN } from '@rgux/contracts';
import { KnowledgeDomain } from './domain.js';

/**
 * The evaluation question set.
 *
 * Labels exist before the system does, deliberately. Card-type selection
 * accuracy and Recall@K are both scored against these, and a metric whose
 * ground truth is written after the thing it measures is a metric shaped by
 * the results.
 *
 * The load-bearing check is that every golden identifier resolves against the
 * real chunk set. A well-formed identifier that resolves to nothing would pass
 * every shape check while silently removing its question from the recall
 * denominator — the same failure as a plausible placeholder that satisfies a
 * format test.
 */

export const EvalQuestion = z
  .strictObject({
    id: z.string().regex(/^(rag|gui|int|ins)-\d{3}$/),
    question: z.string().min(10),
    domain: KnowledgeDomain,
    /**
     * A set, not a single value: several questions legitimately admit more
     * than one good presentation, and scoring against one arbitrary choice
     * would count a defensible answer as wrong.
     */
    expectedCardTypes: z
      .array(z.enum(CARD_TYPES as unknown as [string, ...string[]]))
      .min(1),
    goldenEvidenceIds: z.array(z.string().regex(EVIDENCE_ID_PATTERN)),
    expectInsufficient: z.boolean(),
  })
  .superRefine((question, ctx) => {
    if (question.expectInsufficient && question.goldenEvidenceIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'a question the corpus cannot answer must carry no golden evidence',
        path: ['goldenEvidenceIds'],
      });
    }
    if (!question.expectInsufficient && question.goldenEvidenceIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'an answerable question must carry at least one golden evidence identifier',
        path: ['goldenEvidenceIds'],
      });
    }
    const ids = question.goldenEvidenceIds;
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'duplicate golden evidence identifier',
        path: ['goldenEvidenceIds'],
      });
    }
  });

export type EvalQuestion = z.infer<typeof EvalQuestion>;

/** First line of the file: what the labels were written against. */
export const EvalHeader = z.strictObject({
  _header: z.strictObject({
    corpusVersion: z.string().regex(/^corpus-[0-9a-f]{12}$/),
    chunking: z.strictObject({
      boundary: z.string().min(1),
      maxChunkChars: z.number().int().positive(),
    }),
    questionCount: z.number().int().positive(),
    labelledBy: z.string().min(1),
    labelledOn: z.iso.date(),
  }),
});

export type EvalHeader = z.infer<typeof EvalHeader>['_header'];

export interface EvalSet {
  header: EvalHeader;
  questions: EvalQuestion[];
}

export interface EvalProblem {
  where: string;
  message: string;
}

export function parseEvalSet(source: string): { set?: EvalSet; problems: EvalProblem[] } {
  const problems: EvalProblem[] = [];
  const lines = source.split('\n').filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { problems: [{ where: 'file', message: 'empty question set' }] };
  }

  const headerResult = EvalHeader.safeParse(JSON.parse(lines[0]!));
  if (!headerResult.success) {
    return {
      problems: [
        {
          where: 'line 1',
          message: `header: ${headerResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        },
      ],
    };
  }

  const questions: EvalQuestion[] = [];
  const seen = new Set<string>();

  for (const [index, line] of lines.slice(1).entries()) {
    const where = `line ${index + 2}`;
    const parsed = EvalQuestion.safeParse(JSON.parse(line));
    if (!parsed.success) {
      problems.push({
        where,
        message: parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; '),
      });
      continue;
    }
    if (seen.has(parsed.data.id)) {
      problems.push({ where, message: `duplicate question id ${parsed.data.id}` });
    }
    seen.add(parsed.data.id);
    questions.push(parsed.data);
  }

  return { set: { header: headerResult.data._header, questions }, problems };
}

export interface ResolutionReport {
  /** Golden identifiers naming a chunk that does not exist. */
  unresolved: Array<{ questionId: string; evidenceId: string }>;
  /** True when the labels were written against a different corpus. */
  corpusMismatch?: { labelled: string; actual: string };
  /** Notes no question's golden evidence touches. */
  untouchedDocuments: string[];
}

/**
 * The check the acceptance criteria call for: every golden identifier resolves
 * to a chunk that actually exists, verified against the chunk set rather than
 * by reading.
 */
export function resolveGoldenEvidence(
  set: EvalSet,
  chunkIds: Iterable<string>,
  actualCorpusVersion: string,
): ResolutionReport {
  const available = new Set(chunkIds);
  const unresolved: Array<{ questionId: string; evidenceId: string }> = [];
  const touched = new Set<string>();

  for (const question of set.questions) {
    for (const evidenceId of question.goldenEvidenceIds) {
      if (available.has(evidenceId)) {
        touched.add(evidenceId.split('#')[0]!);
      } else {
        unresolved.push({ questionId: question.id, evidenceId });
      }
    }
  }

  const documents = new Set([...available].map((id) => id.split('#')[0]!));

  return {
    unresolved,
    ...(set.header.corpusVersion === actualCorpusVersion
      ? {}
      : { corpusMismatch: { labelled: set.header.corpusVersion, actual: actualCorpusVersion } }),
    untouchedDocuments: [...documents].filter((doc) => !touched.has(doc)).sort(),
  };
}
