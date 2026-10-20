import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { BM25_B, BM25_K1, BM25Retriever, ingest, parseEvalSet } from '@rgux/corpus';
import { plannerSchema } from '../planner/plan.js';
import { PLANNER_PROMPT_VERSION } from '../planner/prompt.js';
import { profileByIdOrThrow } from '../profile.js';
import { requestExtras } from '../generate.js';

export const ExperimentConfig = z.strictObject({
  version: z.string().min(1),
  implementation: z.enum(['native', 'langchain', 'both', 'langgraph']),
  questionIds: z.array(z.string()).min(1).refine((ids) => new Set(ids).size === ids.length),
  profileId: z.string().min(1),
  k: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  maxModelCalls: z.number().int().positive(),
  // No hidden SDK calls outside the experiment's budget.
  sdkMaxRetries: z.literal(0),
  timeoutMs: z.number().int().positive(),
  repetitions: z.literal(1),
  repair: z.literal('disabled'),
  graph: z.strictObject({
    version: z.literal('bounded-retrieval-1'),
    maxSupplementalRetrievals: z.literal(1),
    maxModelCallsPerQuestion: z.number().int().min(1).max(4),
    controlMaxTokens: z.number().int().positive(),
    maxEvidence: z.number().int().positive(),
    maxContextChars: z.number().int().positive(),
  }).optional(),
}).superRefine((config, ctx) => {
  if (config.implementation === 'langgraph' && !config.graph) {
    ctx.addIssue({ code: 'custom', message: 'langgraph requires a graph policy', path: ['graph'] });
  }
});
export type ExperimentConfig = z.infer<typeof ExperimentConfig>;

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function loadExperiment(repoRoot: string, configPath: string, implementation?: string) {
  const source = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const config = ExperimentConfig.parse({ ...source, ...(implementation === undefined ? {} : { implementation }) });
  const profile = profileByIdOrThrow(config.profileId);
  const corpus = ingest(resolve(repoRoot, 'knowledge'));
  if (corpus.errors.length) throw new Error(corpus.errors.map((error) => error.message).join('\n'));
  const questionSource = readFileSync(resolve(repoRoot, 'eval/questions.jsonl'), 'utf8');
  const { set, problems } = parseEvalSet(questionSource);
  if (!set || problems.length) throw new Error(`Invalid question set: ${JSON.stringify(problems)}`);
  if (set.header.corpusVersion !== corpus.corpusVersion) {
    throw new Error('Question labels and ingested corpus versions disagree; run eval:build.');
  }
  const questions = config.questionIds.map((id) => {
    const question = set.questions.find((item) => item.id === id);
    if (!question) throw new Error(`Unknown question: ${id}`);
    return question;
  });
  if (questions.length > config.maxModelCalls) throw new Error('Sample count exceeds maxModelCalls.');
  const schema = plannerSchema(repoRoot);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  // Include uncommitted work: a commit alone would mislabel a local experiment.
  // Ignored outputs are excluded, so saving a run does not change the next run's code version.
  const paths = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    .split('\0').filter(Boolean).sort();
  const tree = createHash('sha256');
  for (const path of paths) {
    tree.update(path).update('\0').update(sha256(readFileSync(resolve(repoRoot, path)))).update('\0');
  }
  const require = createRequire(resolve(repoRoot, 'packages/generation/package.json'));
  const version = (resolver: typeof require, name: string, entry = name): string => {
    let dir = dirname(resolver.resolve(entry));
    for (;;) {
      const path = resolve(dir, 'package.json');
      if (existsSync(path)) {
        const metadata = JSON.parse(readFileSync(path, 'utf8')) as { name: string; version: string };
        if (metadata.name === name) return metadata.version;
      }
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`Cannot locate installed version of ${name}`);
      dir = parent;
    }
  };
  const langchainRequire = createRequire(require.resolve('@langchain/anthropic'));
  const lock = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'));

  return {
    config, profile, questions, schema,
    retriever: new BM25Retriever(corpus.evidence),
    evidenceById: new Map(corpus.evidence.map((item) => [item.id, item])),
    pins: {
      config,
      code: {
        commit: git('rev-parse', 'HEAD').trim(),
        dirty: git('status', '--porcelain').trim().length > 0,
        treeSha256: tree.digest('hex'),
      },
      runtime: {
        node: process.version,
        sdk: { name: '@anthropic-ai/sdk', version: version(require, '@anthropic-ai/sdk') },
        langchain: {
          anthropic: version(require, '@langchain/anthropic'), core: version(require, '@langchain/core', '@langchain/core/messages'),
          sdk: version(langchainRequire, '@anthropic-ai/sdk'),
          langgraph: version(require, '@langchain/langgraph'),
        },
        lockSha256: sha256(lock),
      },
      corpus: {
        version: corpus.corpusVersion, chunking: set.header.chunking,
        indexSha256: sha256(JSON.stringify(corpus.evidence)),
      },
      retrieval: { implementation: 'BM25Retriever', k: config.k, k1: BM25_K1, b: BM25_B, reranking: false },
      questionSet: { sha256: sha256(questionSource), header: set.header, selectedIds: config.questionIds },
      model: { ...profile, endpoint: profile.baseURL ?? 'https://api.anthropic.com', requestExtras: requestExtras(profile) },
      promptVersion: PLANNER_PROMPT_VERSION,
      schemaSha256: sha256(JSON.stringify(schema)),
    },
  };
}

export type ExperimentInputs = ReturnType<typeof loadExperiment>;
