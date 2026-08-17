// lib/ai-fallback.ts
// Sequential cross-provider failover for server/admin AI workloads.
//
// Goals:
// - keep a task running when a provider hits TPM/RPM/quota/credit limits;
// - move to another provider when the primary is unavailable or times out;
// - allow a larger-context fallback to recover from context-window errors;
// - never loop forever or silently retry malformed requests across every vendor.

import {
  AI_PROVIDERS,
  generateWithProvider,
  getAvailableProviders,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIProviderKey,
} from "./ai-providers";

export type AIFailureKind =
  | "rate_limit"
  | "quota_or_credit"
  | "context_limit"
  | "provider_unavailable"
  | "timeout"
  | "auth_or_key"
  | "bad_request"
  | "empty_response"
  | "unknown";

export interface AIFallbackAttempt {
  provider: AIProviderKey;
  model: string;
  success: boolean;
  failure_kind?: AIFailureKind;
  error?: string;
  duration_ms?: number;
  estimated_cost_usd?: number;
}

export interface AIFallbackOptions {
  /** Explicit priority order. Unconfigured providers are skipped. */
  providers?: AIProviderKey[];
  /** Hard ceiling on provider attempts. Defaults to all resolved providers. */
  maxProviders?: number;
  /**
   * Normally malformed 4xx requests fail fast because repeating them can waste
   * money and hide an application bug. Set true only for provider-specific
   * request compatibility experiments.
   */
  fallbackOnBadRequest?: boolean;
}

export interface AIFallbackResponse extends AIGenerateResponse {
  fallback_used: boolean;
  attempts: AIFallbackAttempt[];
}

/**
 * Quality/reliability-first default. The actual list is filtered to providers
 * whose API keys are configured. Override with AI_FALLBACK_ORDER, e.g.
 * "gpt,gemini,perplexity,grok,nvidia".
 */
export const DEFAULT_AI_FALLBACK_ORDER: AIProviderKey[] = [
  "gpt",
  "gemini",
  "perplexity",
  "grok",
  "nvidia",
  "nvidia_llama_70b",
  "nvidia_nemotron_70b",
  "nvidia_llama_8b",
];

function isProviderKey(value: string): value is AIProviderKey {
  return Object.prototype.hasOwnProperty.call(AI_PROVIDERS, value);
}

function uniqueProviders(values: AIProviderKey[]): AIProviderKey[] {
  return [...new Set(values)];
}

export function resolveFallbackOrder(
  requested?: AIProviderKey[],
  available: AIProviderKey[] = getAvailableProviders(),
  envOrder: string | undefined = process.env.AI_FALLBACK_ORDER
): AIProviderKey[] {
  const availableSet = new Set(available);

  const envProviders = (envOrder ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isProviderKey);

  const preferred = requested?.length
    ? requested
    : envProviders.length
      ? envProviders
      : DEFAULT_AI_FALLBACK_ORDER;

  // Preserve the requested/default priority, then append any configured
  // providers that were omitted so a forgotten config entry does not reduce
  // resilience.
  return uniqueProviders([
    ...preferred.filter((provider) => availableSet.has(provider)),
    ...available.filter((provider) => !preferred.includes(provider)),
  ]);
}

export function classifyAIProviderError(error?: string): AIFailureKind {
  if (!error) return "empty_response";
  const normalized = error.toLowerCase();

  // Context errors are often HTTP 400, so detect them before generic 4xx.
  if (
    /context[_ -]?length|maximum context|context window|prompt.{0,20}too long|input.{0,20}too long|too many tokens|max(?:imum)?[_ -]?tokens.{0,20}(?:exceed|limit)/i.test(
      normalized
    )
  ) {
    return "context_limit";
  }

  // Daily/monthly quota and prepaid-credit exhaustion should immediately move
  // to a different vendor instead of repeatedly hammering the same account.
  if (
    /insufficient[_ -]?quota|quota[_ -]?exceeded|quota exceeded|credit(?:s)? exhausted|insufficient credit|billing limit|spend limit|usage limit/i.test(
      normalized
    )
  ) {
    return "quota_or_credit";
  }

  if (
    /http 429|too many requests|rate[_ -]?limit|resource[_ -]?exhausted|tpm|rpm|tokens per minute|requests per minute/i.test(
      normalized
    )
  ) {
    return "rate_limit";
  }

  if (/http 408|request timeout|timed out|timeout|aborterror/i.test(normalized)) {
    return "timeout";
  }

  if (
    /http 500|http 502|http 503|http 504|service unavailable|temporarily unavailable|overloaded|capacity|provider unavailable|model[_ -]?not[_ -]?found|model not found/i.test(
      normalized
    )
  ) {
    return "provider_unavailable";
  }

  if (
    /http 401|http 403|unauthorized|forbidden|invalid api key|api key not configured|authentication|permission denied/i.test(
      normalized
    )
  ) {
    return "auth_or_key";
  }

  if (/http 400|http 404|http 405|http 409|http 415|http 422|bad request|invalid[_ -]?request|unprocessable/i.test(normalized)) {
    return "bad_request";
  }

  return "unknown";
}

export function shouldFallbackForFailure(
  kind: AIFailureKind,
  options: Pick<AIFallbackOptions, "fallbackOnBadRequest"> = {}
): boolean {
  if (kind === "bad_request") return options.fallbackOnBadRequest === true;
  return true;
}

/**
 * Run a normalized AI request against configured providers in priority order.
 * The first successful non-empty response wins. Provider failures are retained
 * in `attempts` for observability and cost/debug auditing.
 */
export async function generateWithFallback(
  req: AIGenerateRequest,
  options: AIFallbackOptions = {}
): Promise<AIFallbackResponse> {
  const order = resolveFallbackOrder(options.providers);
  if (order.length === 0) {
    throw new Error(
      "No AI providers are configured. Set at least one provider API key before using fallback routing."
    );
  }

  const maxProviders = Math.max(
    1,
    Math.min(options.maxProviders ?? order.length, order.length)
  );
  const attempts: AIFallbackAttempt[] = [];
  let lastResponse: AIGenerateResponse | null = null;

  for (const provider of order.slice(0, maxProviders)) {
    let response: AIGenerateResponse;

    try {
      response = await generateWithProvider(provider, req);
    } catch (error) {
      response = {
        provider,
        model: AI_PROVIDERS[provider].model,
        content: "",
        error: error instanceof Error ? error.message : String(error),
        success: false,
      };
    }

    lastResponse = response;
    const success = response.success === true || (!response.error && response.content.trim().length > 0);

    if (success) {
      attempts.push({
        provider,
        model: response.model,
        success: true,
        duration_ms: response.duration_ms,
        estimated_cost_usd: response.estimated_cost_usd,
      });
      return {
        ...response,
        success: true,
        fallback_used: attempts.length > 1,
        attempts,
      };
    }

    const failureKind = classifyAIProviderError(response.error);
    attempts.push({
      provider,
      model: response.model,
      success: false,
      failure_kind: failureKind,
      error: response.error ?? "Provider returned an empty response",
      duration_ms: response.duration_ms,
      estimated_cost_usd: response.estimated_cost_usd,
    });

    if (!shouldFallbackForFailure(failureKind, options)) {
      break;
    }
  }

  if (!lastResponse) {
    throw new Error("AI fallback routing ended before any provider attempt was made.");
  }

  return {
    ...lastResponse,
    success: false,
    error: lastResponse.error ?? "All configured AI providers failed or returned empty responses",
    fallback_used: attempts.length > 1,
    attempts,
  };
}
