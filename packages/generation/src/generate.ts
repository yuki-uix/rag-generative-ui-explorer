import Anthropic from '@anthropic-ai/sdk';
import type { Evidence } from '@rgux/contracts';
import { validateAnswer, type GroundedAnswer } from './answer.js';
import { PROMPT_VERSION, systemPrompt, userPrompt } from './prompt.js';
import type { ModelProfile } from './profile.js';

export interface GenerationRecord {
  readonly profileId: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly maxTokens: number;
  /** Raw completion before validation. Load-bearing: "valid without repair" cannot be computed from a repaired log. */
  readonly raw: string;
  readonly answer: GroundedAnswer;
  readonly stopReason: string | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheCreationInputTokens: number;
    readonly cacheReadInputTokens: number;
  };
  /**
   * Milliseconds to the first text delta — the metric `eval/PROTOCOL.md` names
   * as the Markdown arm's advantage. Total latency is not a substitute: the
   * whole argument for streaming is that a reader starts reading before the
   * response is finished, so recording only the end hides the thing being
   * claimed. `null` when nothing was ever emitted.
   */
  readonly firstTokenMs: number | null;
  /**
   * Whether the response carried reasoning the reader never sees.
   *
   * `usage.output_tokens` counts it. Measured on the DeepSeek profile: a
   * two-line answer reported 720 output tokens, of which roughly fifty were
   * visible. Comparing arms on output tokens without recording this attributes
   * reasoning spend to answer length, and `first token` means first *visible*
   * token — the model thinks before it streams, which is why that number is
   * seconds rather than milliseconds.
   */
  readonly hadHiddenReasoning: boolean;
  readonly latencyMs: number;
}

/**
 * The optional request parameters a profile declares, and nothing else.
 *
 * `thinking` and `output_config` belong to Anthropic's API. Sending them to
 * another endpoint is an error rather than a no-op, which is why this is driven
 * by the profile instead of being written into every request. Exported so a
 * test can assert the omission without a network call — the failure it guards
 * against only appears against a live endpoint otherwise.
 */
export function requestExtras(profile: ModelProfile): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (profile.supportsThinking) extras['thinking'] = { type: 'adaptive' };
  if (profile.supportsEffort) extras['output_config'] = { effort: 'high' };
  return extras;
}

export interface GenerateOptions {
  profile: ModelProfile;
  question: string;
  evidence: readonly Evidence[];
  maxTokens?: number;
  /** Called with each text delta, so a caller can stream to a reader. */
  onDelta?: (text: string) => void;
}

/**
 * Generate a grounded Markdown answer.
 *
 * Streaming is not a nicety here. It is the Markdown arm's stated advantage on
 * time to first content in `eval/PROTOCOL.md`, so the baseline has to actually
 * stream or the comparison measures the wrong thing.
 */
export async function generateAnswer({
  profile,
  question,
  evidence,
  maxTokens = 4096,
  onDelta,
}: GenerateOptions): Promise<GenerationRecord> {
  const apiKey = process.env[profile.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${profile.apiKeyEnv} is not set; profile ${profile.id} cannot run.`);
  }

  const client = new Anthropic({ apiKey, baseURL: profile.baseURL });

  const extras = requestExtras(profile);

  const startedAt = Date.now();
  const stream = client.messages.stream({
    model: profile.model,
    max_tokens: maxTokens,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt({ question, evidence }) }],
    ...extras,
  });

  let firstTokenMs: number | null = null;
  stream.on('text', (text) => {
    firstTokenMs ??= Date.now() - startedAt;
    onDelta?.(text);
  });

  const message = await stream.finalMessage();
  const latencyMs = Date.now() - startedAt;

  const hadHiddenReasoning = message.content.some((block) => block.type !== 'text');

  const raw = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    profileId: profile.id,
    model: message.model,
    promptVersion: PROMPT_VERSION,
    maxTokens,
    raw,
    answer: validateAnswer(raw, evidence),
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      // Reported separately because a cache read costs about a tenth of an
      // uncached token; one total would conflate them, per PROTOCOL.
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    firstTokenMs,
    hadHiddenReasoning,
    latencyMs,
  };
}
