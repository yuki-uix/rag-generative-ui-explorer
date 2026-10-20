import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage, isAIMessage } from '@langchain/core/messages';
import type { PlanOptions, PlanRecord } from '../planner/plan.js';
import { PLANNER_PROMPT_VERSION, plannerSystemPrompt, plannerUserPrompt, schemaBelongsInPrompt } from '../planner/prompt.js';

/** Anthropic SDK's schema transformer rejects an enum without an explicit type. */
export function explicitEnumTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(explicitEnumTypes);
  if (node === null || typeof node !== 'object') return node;
  const result: Record<string, unknown> = Object.fromEntries(
    Object.entries(node).map(([key, value]) => [key, explicitEnumTypes(value)]),
  );
  if (result['type'] === undefined && Array.isArray(result['enum']) && result['enum'].every((value) => typeof value === 'string')) {
    result['type'] = 'string';
  }
  return result;
}

/** Only the invocation layer changes; parsing here never substitutes for gate(). */
export interface LangChainJSONOptions extends PlanOptions {
  system: string;
  user: string;
  promptVersion: string;
}

export async function invokeLangChainJSON(options: LangChainJSONOptions): Promise<PlanRecord> {
  const { profile, schema } = options;
  const apiKey = options.apiKey ?? process.env[profile.apiKeyEnv];
  if (!apiKey) throw new Error(`${profile.apiKeyEnv} is not set; profile ${profile.id} cannot run.`);
  const model = new ChatAnthropic({
    model: profile.model, apiKey, maxTokens: options.maxTokens ?? 4096,
    maxRetries: options.maxRetries ?? 0, streaming: true, streamUsage: true,
    clientOptions: {
      baseURL: profile.baseURL ?? 'https://api.anthropic.com',
      maxRetries: 0,
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    },
    ...(profile.supportsThinking ? { thinking: { type: 'adaptive' as const } } : {}),
    ...(profile.supportsEffort ? { outputConfig: { effort: 'high' as const } } : {}),
  });
  // Select explicitly: the default uses forced tool calling, a different task.
  // Plain JSON Schema selects JsonOutputParser, not Zod/schema validation.
  const structured = model.withStructuredOutput(explicitEnumTypes(schema) as Record<string, unknown>, {
    method: 'jsonSchema', includeRaw: true,
  });
  const started = performance.now();
  const response = await structured.invoke([
    new SystemMessage(options.system),
    new HumanMessage(options.user),
  ], {
    ...(options.timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(options.timeoutMs) }),
    callbacks: [{ handleLLMNewToken: (text: string) => { options.onDelta?.(text); } }],
  });
  const raw = response.raw;
  if (!isAIMessage(raw)) throw new Error('LangChain returned a non-AI message.');
  const metadata = raw.response_metadata;
  const additional = raw.additional_kwargs;
  const usage = metadata['usage'] as Record<string, unknown> | undefined;
  const normalizedUsage = (raw as unknown as {
    usage_metadata?: { input_tokens?: number; output_tokens?: number };
  }).usage_metadata;
  const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const cacheCreation = number(usage?.['cache_creation_input_tokens']);
  const cacheRead = number(usage?.['cache_read_input_tokens']);
  // LangChain input_tokens INCLUDES cache reads/writes; native SDK does not.
  const totalInput = number(normalizedUsage?.input_tokens);
  const stop = additional['stop_reason'] ?? metadata['stop_reason'];
  const actualModel = additional['model'] ?? metadata['model'];
  return {
    profileId: profile.id, model: typeof actualModel === 'string' ? actualModel : profile.model,
    promptVersion: options.promptVersion,
    // Requesting JSON Schema is not evidence that this endpoint enforces it.
    schemaEnforced: profile.enforcesOutputSchema,
    raw: raw.text,
    stopReason: typeof stop === 'string' ? stop : null,
    usage: {
      inputTokens: totalInput === null ? null : totalInput - (cacheCreation ?? 0) - (cacheRead ?? 0),
      outputTokens: number(normalizedUsage?.output_tokens),
      cacheCreationInputTokens: cacheCreation, cacheReadInputTokens: cacheRead,
    },
    latencyMs: performance.now() - started,
    framework: {
      name: 'langchain', method: 'jsonSchema', parser: 'JsonOutputParser', schemaValidated: false,
      parserSucceeded: response.parsed !== null, parsed: response.parsed,
    },
  };
}

export function planWithLangChain(options: PlanOptions): Promise<PlanRecord> {
  return invokeLangChainJSON({
    ...options, promptVersion: PLANNER_PROMPT_VERSION,
    system: plannerSystemPrompt(schemaBelongsInPrompt(options.profile) ? options.schema : undefined),
    user: plannerUserPrompt(options.question, options.evidence),
  });
}
