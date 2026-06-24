// lib/ai-providers.ts
// Multi-AI provider abstraction for For-Ai fact registry
// Supports: Perplexity, Gemini, GPT, Grok

export type AIProviderKey = "perplexity" | "gemini" | "gpt" | "grok";

export interface AIProviderConfig {
  key: AIProviderKey;
  label: string;
  model: string;
  endpoint: string;
  envKey: string;
  supportsWebSearch: boolean;
}

export const AI_PROVIDERS: Record<AIProviderKey, AIProviderConfig> = {
  perplexity: {
    key: "perplexity",
    label: "Perplexity (sonar-pro)",
    model: "sonar-pro",
    endpoint: "https://api.perplexity.ai/chat/completions",
    envKey: "PERPLEXITY_API_KEY",
    supportsWebSearch: true,
  },
  gemini: {
    key: "gemini",
    label: "Gemini 2.0 Flash",
    model: "gemini-2.0-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    envKey: "GOOGLE_GEMINI_API_KEY",
    supportsWebSearch: false,
  },
  gpt: {
    key: "gpt",
    label: "GPT-4o",
    model: "gpt-4o",
    endpoint: "https://api.openai.com/v1/chat/completions",
    envKey: "OPENAI_API_KEY",
    supportsWebSearch: false,
  },
  grok: {
    key: "grok",
    label: "Grok",
    model: "grok-3-mini",
    endpoint: "https://api.x.ai/v1/chat/completions",
    envKey: "XAI_API_KEY",
    supportsWebSearch: false,
  },
};

export interface AIGenerateRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface AIGenerateResponse {
  provider: AIProviderKey;
  model: string;
  content: string;
  citations?: string[];
  error?: string;
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
  const apiKey = getApiKey(config);
  if (!apiKey) return { provider: "perplexity", model: config.model, content: "", error: "API key not configured" };

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
    return { provider: "perplexity", model: config.model, content: "", error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
  }

  const json = await res.json();
  return {
    provider: "perplexity",
    model: config.model,
    content: json.choices?.[0]?.message?.content ?? "",
    citations: json.citations ?? [],
  };
}

async function callGemini(
  config: AIProviderConfig,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  const apiKey = getApiKey(config);
  if (!apiKey) return { provider: "gemini", model: config.model, content: "", error: "API key not configured" };

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
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { provider: "gemini", model: config.model, content: "", error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
  }

  const json = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { provider: "gemini", model: config.model, content };
}

async function callOpenAI(
  config: AIProviderConfig,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  const apiKey = getApiKey(config);
  if (!apiKey) return { provider: config.key, model: config.model, content: "", error: "API key not configured" };

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
      max_tokens: 8192,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { provider: config.key, model: config.model, content: "", error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
  }

  const json = await res.json();
  return {
    provider: config.key,
    model: config.model,
    content: json.choices?.[0]?.message?.content ?? "",
  };
}

export async function generateWithProvider(
  provider: AIProviderKey,
  req: AIGenerateRequest
): Promise<AIGenerateResponse> {
  const config = AI_PROVIDERS[provider];

  switch (provider) {
    case "perplexity":
      return callPerplexity(config, req);
    case "gemini":
      return callGemini(config, req);
    case "gpt":
      return callOpenAI(config, req);
    case "grok":
      return callOpenAI(config, req); // Grok uses OpenAI-compatible API
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
