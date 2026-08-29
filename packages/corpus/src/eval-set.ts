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

/**
 * Sections no question needs golden evidence from, by design rather than by
 * oversight.
 *
 * The structural three are every note's framing and closing material: a
 * preamble, and the sections relating the subject to this project. Neither is
 * an answer to a knowledge question about the subject.
 *
 * Anything else listed here is a judgement, written down with its reason. The
 * point of the list is that "this section does not need to be measured" becomes
 * a recorded decision rather than a silence — an earlier version of the
 * question set left a note's central argument unmeasured, and the note-level
 * check stayed green because other sections of that note were cited.
 */
export const UNMEASURED_SECTIONS = {
  structural: ['body', 'what-this-means-here', 'what-this-project-defers'],
  /** section slug -> why no question needs evidence from it */
  bySection: {
    'the-debate-that-came-back': 'historical framing for the note that follows',
    'the-problem-it-names': 'motivation restated by the sections that answer it',
    'the-levels-are-not-a-ladder': 'a caution about the taxonomy, not part of it',
    'malleability-is-the-same-problem-further-out': 'widens the frame past the question set',
    'the-reader-who-explores-most-loses-most': 'restates the cost the section above establishes',
    'keeping-the-original': 'mitigation for a failure covered by its own question',
    'what-holds-and-what-does-not': 'a stocktake of claims covered individually',
  },
} as const;

export interface SectionCoverage {
  documentId: string;
  section: string;
  /** Present when the section is deliberately unmeasured. */
  exemptReason?: string;
}

/**
 * Sections carrying no golden evidence. Reported per section rather than per
 * note: a note-level check passes while an entire section — possibly the one
 * carrying the note's central claim — goes unmeasured.
 */
export function uncoveredSections(
  set: EvalSet,
  chunkIds: Iterable<string>,
): {
  unmeasured: SectionCoverage[];
  unexplained: SectionCoverage[];
  /**
   * Exemptions for sections that are in fact measured. An exemption nobody
   * needs is a standing permission rather than a judgement, and three of the
   * first ten were already stale when they were written.
   */
  staleExemptions: string[];
} {
  const cited = new Set(set.questions.flatMap((question) => question.goldenEvidenceIds));
  const sections = new Map<string, { documentId: string; section: string; covered: boolean }>();

  for (const chunkId of chunkIds) {
    const [documentId, section] = chunkId.split('#') as [string, string];
    const key = `${documentId}#${section}`;
    const entry = sections.get(key) ?? { documentId, section, covered: false };
    entry.covered = entry.covered || cited.has(chunkId);
    sections.set(key, entry);
  }

  const unmeasured: SectionCoverage[] = [];
  const unexplained: SectionCoverage[] = [];

  for (const entry of [...sections.values()].sort((a, b) =>
    `${a.documentId}#${a.section}`.localeCompare(`${b.documentId}#${b.section}`),
  )) {
    if (entry.covered) continue;

    const structural = (UNMEASURED_SECTIONS.structural as readonly string[]).includes(
      entry.section,
    );
    const reason = structural
      ? 'structural section'
      : (UNMEASURED_SECTIONS.bySection as Record<string, string>)[entry.section];

    const record: SectionCoverage = {
      documentId: entry.documentId,
      section: entry.section,
      ...(reason === undefined ? {} : { exemptReason: reason }),
    };
    unmeasured.push(record);
    if (reason === undefined) unexplained.push(record);
  }

  const coveredSections = new Set(
    [...sections.values()].filter((entry) => entry.covered).map((entry) => entry.section),
  );
  const staleExemptions = Object.keys(UNMEASURED_SECTIONS.bySection)
    .filter((slug) => coveredSections.has(slug))
    .sort();

  return { unmeasured, unexplained, staleExemptions };
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
