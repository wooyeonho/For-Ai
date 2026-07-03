// lib/ai-providers.ts
// Multi-AI provider abstraction for For-Ai fact registry
// Provider output is candidate-generation input only. AI-generated content may
// enter topic_candidates, but must not directly create claims, claim_sources,
// verification_events, or verified facts.
// Supports provider keys: perplexity, gemini, gpt, grok, nvidia_*

export type AIProviderKey =
  | "perplexity"
  | "gemini"
  | "gpt"
  | "grok"
  | "nvidia"
  | "nvidia_llama_70b"
  | "nvidia_nemotron_70b"
  | "nvidia_llama_8b";

export interface AIProviderConfig {
  key: AIProviderKey;
  label: string;
  model: string;
  endpoint: string;
  envKey: string;
  supportsWebSearch: boolean;
  // Consensus weighting. `weight` reflects trust in the model's factual output
  // (web-search-grounded > frontier parametric > smaller parametric).
  // `vendorGroup` lets the consensus algorithm cap how much a single vendor can
  // contribute, so correlated errors from same-vendor models can't manufacture
  // a false "majority".
  weight: number;
  vendorGroup: string;
  estimatedCostPer1kTokensUsd: number;
}

export const AI_PROVIDERS: Record<AIProviderKey, AIProviderConfig> = {
  perplexity: {
    key: "perplexity",
    label: "Perplexity (sonar-pro)",
    model: "sonar-pro",
    endpoint: "https://api.perplexity.ai/chat/completions",
    envKey: "PERPLEXITY_API_KEY",
    supportsWebSearch: true,
    weight: 1.5,
    vendorGroup: "perplexity",
    estimatedCostPer1kTokensUsd: 0.003,
  },
  nvidia: {
    key: "nvidia",
    label: "NVIDIA NIM",
    model: process.env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-70b-instruct",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    envKey: "NVIDIA_API_KEY",
    supportsWebSearch: false,
    weight: 0.6,
    vendorGroup: "nvidia",
    estimatedCostPer1kTokensUsd: 0.0008,
  },
  gemini: {
    key: "gemini",
    label: "Gemini 2.0 Flash",
    model: "gemini-2.0-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    envKey: "GOOGLE_GEMINI_API_KEY",
    supportsWebSearch: false,
    weight: 1.0,
    vendorGroup: "google",
    estimatedCostPer1kTokensUsd: 0.00015,
  },
  gpt: {
    key: "gpt",
    label: "OpenAI GPT-4o",
    model: "gpt-4o",
    endpoint: "https://api.openai.com/v1/chat/completions",
    envKey: "OPENAI_API_KEY",
    supportsWebSearch: false,
    weight: 1.0,
    vendorGroup: "openai",
    estimatedCostPer1kTokensUsd: 0.00375,
  },
  grok: {
    key: "grok",
    label: "xAI Grok",
    model: "grok-3-mini",
    endpoint: "https://api.x.ai/v1/chat/completions",
    envKey: "XAI_API_KEY",
    supportsWebSearch: false,
    weight: 1.0,
    vendorGroup: "xai",
    estimatedCostPer1kTokensUsd: 0.0006,
  },
  nvidia_llama_70b: {
    key: "nvidia_llama_70b",
    label: "NVIDIA Llama 70B",
    model: "meta/llama-3.1-70b-instruct",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    envKey: "NVIDIA_API_KEY",
    supportsWebSearch: false,
    weight: 0.6,
    vendorGroup: "nvidia",
    estimatedCostPer1kTokensUsd: 0.0008,
  },
  nvidia_nemotron_70b: {
    key: "nvidia_nemotron_70b",
    label: "NVIDIA Nemotron 70B",
    model: "nvidia/llama-3.1-nemotron-70b-instruct",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    envKey: "NVIDIA_API_KEY",
    supportsWebSearch: false,
    weight: 0.6,
    vendorGroup: "nvidia",
    estimatedCostPer1kTokensUsd: 0.0008,
  },
  nvidia_llama_8b: {
    key: "nvidia_llama_8b",
    label: "NVIDIA Llama 8B",
    model: "meta/llama-3.1-8b-instruct",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    envKey: "NVIDIA_API_KEY",
    supportsWebSearch: false,
    weight: 0.5,
    vendorGroup: "nvidia",
    estimatedCostPer1kTokensUsd: 0.0008,
  },
};

// Maximum total weight any single vendor group can contribute to a consensus
// score. Four NVIDIA models (0.6·3 + 0.5) would otherwise sum to 2.3 and
// dominate a multi-vendor panel; capping keeps one vendor from manufacturing a
// majority through correlated same-family errors.
export const VENDOR_GROUP_WEIGHT_CAP = 1.5;

export function providerWeight(key: string): number {
  return (AI_PROVIDERS as Record<string, AIProviderConfig>)[key]?.weight ?? 1.0;
}

export function providerVendorGroup(key: string): string {
  return (AI_PROVIDERS as Record<string, AIProviderConfig>)[key]?.vendorGroup ?? key;
}

export function providerEstimatedCostPer1kTokensUsd(key: string): number {
  return (AI_PROVIDERS as Record<string, AIProviderConfig>)[key]?.estimatedCostPer1kTokensUsd ?? 0.001;
}

export function providerSupportsWebSearch(key: string): boolean {
  return (AI_PROVIDERS as Record<string, AIProviderConfig>)[key]?.supportsWebSearch ?? false;
}

// Sum provider weights, capping each vendor group's contribution. Shared by the
// consensus numerator (agreeing providers) and denominator (full panel).
export function cappedGroupWeight(providerKeys: string[]): number {
  const byGroup = new Map<string, number>();
  for (const key of providerKeys) {
    const group = providerVendorGroup(key);
    byGroup.set(group, (byGroup.get(group) ?? 0) + providerWeight(key));
  }
  let total = 0;
  for (const groupWeight of byGroup.values()) {
    total += Math.min(groupWeight, VENDOR_GROUP_WEIGHT_CAP);
  }
  return total;
}

export interface AIGenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Admin-only guard: public request paths must not be able to call paid providers. */
  adminContext: "admin";
}

export interface AIGenerateResponse {
  provider: AIProviderKey;
  model: string;
  content: string;
  citations?: string[];
  error?: string;
  estimated_cost_usd?: number;
  duration_ms?: number;
  success?: boolean;
}

function assertAdminProviderRequest(req: AIGenerateRequest): void {
  if (req.adminContext !== "admin") {
    throw new Error("AI provider calls are admin-only; public request paths must not call providers directly.");
  }
}

function estimateCost(config: AIProviderConfig, req: AIGenerateRequest, content: string): number {
  const approxTokens = Math.ceil(`${req.systemPrompt}\n${req.userPrompt}\n${content}`.length / 4);
  return Number(((approxTokens / 1000) * config.estimatedCostPer1kTokensUsd).toFixed(6));
}

function withMetrics(config: AIProviderConfig, req: AIGenerateRequest, startedAt: number, response: AIGenerateResponse): AIGenerateResponse {
  return {
    ...response,
    duration_ms: Date.now() - startedAt,
    estimated_cost_usd: estimateCost(config, req, response.content),
    success: !response.error && response.content.trim().length > 0,
  };
}

function getApiKey(provider: AIProviderConfig): string | null {
  return process.env[provider.envKey] || null;
}

export function getAvailableProviders(): AIProviderKey[] {
  return (Object.keys(AI_PROVIDERS) as AIProviderKey[]).filter(
    (k) => getApiKey(AI_PROVIDERS[k]) !== null
  );
}

async function callPerplexity(
  config: AIProviderConfig,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  const startedAt = Date.now();
  const apiKey = getApiKey(config);
  if (!apiKey) return withMetrics(config, req, startedAt, { provider: "perplexity", model: config.model, content: "", error: "API key not configured" });

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.3,
      return_citations: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return withMetrics(config, req, startedAt, { provider: "perplexity", model: config.model, content: "", error: `HTTP ${res.status}: ${err.slice(0, 200)}` });
  }

  const json = await res.json();
  return withMetrics(config, req, startedAt, {
    provider: "perplexity",
    model: config.model,
    content: json.choices?.[0]?.message?.content ?? "",
    citations: json.citations ?? [],
  });
}

async function callGemini(
  config: AIProviderConfig,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  const startedAt = Date.now();
  const apiKey = getApiKey(config);
  if (!apiKey) return withMetrics(config, req, startedAt, { provider: "gemini", model: config.model, content: "", error: "API key not configured" });

  const endpoint = `${config.endpoint}?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: `${req.systemPrompt}\n\n${req.userPrompt}` }] },
      ],
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: Math.min(Math.max(req.maxOutputTokens ?? 4096, 256), 8192),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return withMetrics(config, req, startedAt, { provider: "gemini", model: config.model, content: "", error: `HTTP ${res.status}: ${err.slice(0, 200)}` });
  }

  const json = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return withMetrics(config, req, startedAt, { provider: "gemini", model: config.model, content });
}

async function callOpenAI(
  config: AIProviderConfig,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  const startedAt = Date.now();
  const apiKey = getApiKey(config);
  if (!apiKey) return withMetrics(config, req, startedAt, { provider: config.key, model: config.model, content: "", error: "API key not configured" });

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.3,
      max_tokens: Math.min(Math.max(req.maxOutputTokens ?? 4096, 256), 8192),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return withMetrics(config, req, startedAt, { provider: config.key, model: config.model, content: "", error: `HTTP ${res.status}: ${err.slice(0, 200)}` });
  }

  const json = await res.json();
  return withMetrics(config, req, startedAt, {
    provider: config.key,
    model: config.model,
    content: json.choices?.[0]?.message?.content ?? "",
  });
}

export async function generateWithProvider(
  provider: AIProviderKey,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  assertAdminProviderRequest(req);
  const config = AI_PROVIDERS[provider];

  switch (provider) {
    case "perplexity":
      return callPerplexity(config, req);
    case "nvidia":
      return callOpenAI(config, req); // NVIDIA NIM uses an OpenAI-compatible API
    case "gemini":
      return callGemini(config, req);
    case "gpt":
      return callOpenAI(config, req);
    case "grok":
    case "nvidia_llama_70b":
    case "nvidia_nemotron_70b":
    case "nvidia_llama_8b":
      return callOpenAI(config, req); // Grok and NVIDIA use OpenAI-compatible APIs
  }
}

export async function generateWithAll(
  providers: AIProviderKey[],
  req: AIGenerateRequest
): Promise<AIGenerateResponse[]> {
  const results = await Promise.allSettled(
    providers.map((p) => generateWithProvider(p, req))
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { provider: providers[i], model: AI_PROVIDERS[providers[i]].model, content: "", error: String(r.reason) }
  );
}
