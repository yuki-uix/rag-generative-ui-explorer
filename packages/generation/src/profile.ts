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
