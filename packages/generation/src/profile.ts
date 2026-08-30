/**
 * A model profile: the endpoint, the model, and what that endpoint accepts.
 *
 * `eval/PROTOCOL.md` records the profile as a pinned variable rather than
 * pinning one model forever. The reason it has to be a whole profile and not
 * just an ID is that **the request shape is model-dependent**: `thinking` and
 * `output_config.effort` belong to Anthropic's API, and sending them to another
 * endpoint is an error rather than a no-op. A profile therefore carries which
 * optional parameters are valid, and the request builder omits what a profile
 * does not declare instead of hoping the server ignores it.
 *
 * The key never appears here. Each profile names the environment variable it
 * reads, so a profile can be logged in full with a run's results.
 */
export interface ModelProfile {
  /** Stable name recorded with every result. */
  readonly id: string;
  /** Exact model string sent in the request. No date suffixes. */
  readonly model: string;
  /** Endpoint. Omitted for Anthropic's default. */
  readonly baseURL?: string;
  /** Environment variable holding the key. The value is never logged. */
  readonly apiKeyEnv: string;
  /** Anthropic's adaptive thinking. Not universal. */
  readonly supportsThinking: boolean;
  /** Anthropic's `output_config.effort`. Not universal. */
  readonly supportsEffort: boolean;
  /**
   * Whether the endpoint **enforces** a requested output schema.
   *
   * Not whether it accepts one. Measured on DeepSeek by putting the prompt and
   * the schema in conflict — a system prompt demanding plain prose against a
   * schema demanding an object — and seeing which won. The prompt won, and the
   * request had raised no error: `output_config.format` is accepted and
   * silently dropped. A probe that only checks the request succeeds would have
   * reported structured output working.
   *
   * This has to be recorded per profile because it changes what a metric means.
   * "Invalid card specs before repair" measures the model's compliance where
   * the schema is unenforced, and measures almost nothing where it is enforced;
   * comparing the two without saying which is comparing different quantities.
   */
  readonly enforcesOutputSchema: boolean;
}

/**
 * DeepSeek through its Anthropic-compatible endpoint.
 *
 * It speaks the Messages API but is not Anthropic's model, so the two
 * Anthropic-specific parameters are off. Whether it would accept them is not
 * the question: a profile declares what has been checked, and these have not.
 */
export const DEEPSEEK: ModelProfile = {
  id: 'deepseek-v4-pro',
  model: 'deepseek-v4-pro',
  baseURL: 'https://api.deepseek.com/anthropic',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  supportsThinking: false,
  supportsEffort: false,
  // Measured 2026-08-30 with a conflicting prompt and schema; the prompt won.
  enforcesOutputSchema: false,
};

/**
 * Anthropic's Claude Opus 5.
 *
 * The sampling facts in `eval/PROTOCOL.md` — no `temperature`, no `top_p`, no
 * `top_k`, no `budget_tokens` — were checked against this profile and are not
 * claims about any other.
 */
export const CLAUDE_OPUS_5: ModelProfile = {
  id: 'claude-opus-5',
  model: 'claude-opus-5',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  supportsThinking: true,
  supportsEffort: true,
  /**
   * Documented, not measured here. No run against this profile has been made,
   * so this is a claim about Anthropic's documented surface rather than a
   * result — check it before reporting a number produced under it.
   */
  enforcesOutputSchema: true,
};

export const PROFILES: readonly ModelProfile[] = [DEEPSEEK, CLAUDE_OPUS_5];

export function profileByIdOrThrow(id: string): ModelProfile {
  const profile = PROFILES.find((candidate) => candidate.id === id);
  if (!profile) {
    throw new Error(
      `Unknown model profile: ${id}. Known profiles: ${PROFILES.map((p) => p.id).join(', ')}`,
    );
  }
  return profile;
}
