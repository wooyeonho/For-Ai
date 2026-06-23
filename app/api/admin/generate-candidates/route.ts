import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  type AIProviderKey,
  AI_PROVIDERS,
  getAvailableProviders,
  generateWithProvider,
  generateWithAll,
  type AIGenerateResponse,
} from "../../../../lib/ai-providers";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function buildPrompt(topic: string, count: number, lang: string) {
  const langInstructions: Record<string, string> = {
    ko: `"${topic}" 관련해서 사람들이 AI에게 자주 묻는 토픽 ${count}개를 웹 검색으로 찾아 생성하세요.`,
    en: `Find ${count} topics about "${topic}" that people frequently ask AI about, using web search.`,
    hi: `"${topic}" से संबंधित ${count} विषय खोजें जो लोग AI से अक्सर पूछते हैं।`,
    ar: `ابحث عن ${count} مواضيع حول "${topic}" يسألها الناس عادةً من الذكاء الاصطناعي.`,
    es: `Encuentra ${count} temas sobre "${topic}" que la gente pregunta frecuentemente a la IA.`,
    ja: `「${topic}」に関して人々がAIによく聞くトピック${count}件をウェブ検索で見つけてください。`,
    zh: `搜索关于"${topic}"人们经常问AI的${count}个话题。`,
  };

  const instruction = langInstructions[lang] ?? langInstructions.en;

  return `
당신은 GYEOL — 글로벌 팩트 레지스트리의 콘텐츠 큐레이터입니다.
${instruction}

규칙:
- placeholder_value는 반드시 "확인 필요" (절대 실제 숫자/날짜 쓰지 말 것)
- AI가 실제로 자주 틀리는 정보 위주
- 최대한 구체적이고 검색 가능한 토픽
- category는 토픽에 맞게 자유롭게 설정
- title과 why_people_ask_ai는 ${lang} 언어로 작성

각 토픽을 JSON으로:
{
  "title": "제목 (${lang} 언어)",
  "slug": "ascii-slug",
  "category": "자유 카테고리",
  "subcategory": "세부 분류",
  "risk_tier": "low|medium|high",
  "why_people_ask_ai": "왜 AI에게 묻는가 (1문장, ${lang} 언어)",
  "why_ai_gets_wrong": "AI가 왜 틀리는가 (1문장, ${lang} 언어)",
  "claims": [
    {
      "question": "구체적 질문 (${lang} 언어)",
      "placeholder_value": "확인 필요",
      "required_source_type": "official|law|platform|document|news|stats"
    }
  ],
  "source_hints": [
    { "url": "https://실제url", "title": "출처명" }
  ]
}

${count}개를 JSON 배열로만. 설명 없이 JSON만.
`.trim();
}

function buildSystemPrompt(lang: string): string {
  const langMap: Record<string, string> = {
    ko: "Korean",
    en: "English",
    hi: "Hindi",
    ar: "Arabic",
    es: "Spanish",
    ja: "Japanese",
    zh: "Chinese",
  };
  const language = langMap[lang] ?? "English";
  return `You are a global fact-registry curator for GYEOL. Search the web and output only valid JSON arrays. Find real official/platform URLs for source_hints. Accept ANY topic: sports, entertainment, life, IT, finance, government, etc. Output in ${language}.`;
}

function parseCandidatesFromResponse(
  response: AIGenerateResponse,
  lang: string
): Record<string, unknown>[] {
  if (response.error || !response.content) return [];

  try {
    const match = response.content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);

    return parsed.map((c: Record<string, unknown>) => {
      const hints = (c.source_hints as { url: string; title: string }[]) ?? [];
      const citations = response.citations ?? [];
      const hintUrls = new Set(hints.map((h) => h.url));
      const extra = citations
        .filter((u) => !hintUrls.has(u))
        .slice(0, 2)
        .map((u) => {
          try { return { url: u, title: new URL(u).hostname }; }
          catch { return { url: u, title: u }; }
        });

      return {
        ...c,
        source: "ai_generated",
        lang,
        status: "new",
        generation_model: `${response.provider}/${response.model}`,
        claims: ((c.claims ?? []) as Record<string, unknown>[]).map((cl) => ({
          ...cl,
          placeholder_value: "확인 필요",
        })),
        source_hints: [...hints, ...extra],
      };
    });
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (ADMIN_SECRET && auth !== ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const topic = String(body.topic ?? body.category ?? "").trim();
  const count = Math.min(Math.max(parseInt(body.count ?? "10"), 1), 50);
  const lang = String(body.lang ?? "ko").trim();
  const saveToDb = body.save !== false;
  const requestedProviders = body.providers as AIProviderKey[] | undefined;
  const crossVerify = body.cross_verify === true;

  if (!topic) {
    return NextResponse.json({ error: "topic 필드가 필요합니다" }, { status: 400 });
  }

  const available = getAvailableProviders();
  if (available.length === 0) {
    return NextResponse.json({ error: "No AI providers configured. Set at least one API key." }, { status: 500 });
  }

  // Determine which providers to use
  let providers: AIProviderKey[];
  if (requestedProviders && requestedProviders.length > 0) {
    providers = requestedProviders.filter((p) => available.includes(p));
    if (providers.length === 0) {
      return NextResponse.json({
        error: "Requested providers not available",
        available,
        requested: requestedProviders,
      }, { status: 400 });
    }
  } else {
    // Default: use first available (prefer perplexity for web search)
    providers = available.includes("perplexity") ? ["perplexity"] : [available[0]];
  }

  const systemPrompt = buildSystemPrompt(lang);
  const userPrompt = buildPrompt(topic, count, lang);
  const aiRequest = { systemPrompt, userPrompt, temperature: 0.3 };

  let allCandidates: Record<string, unknown>[] = [];
  const providerResults: Record<string, { generated: number; error?: string }> = {};

  if (crossVerify && providers.length >= 2) {
    // Cross-verification: run all providers, merge results
    const responses = await generateWithAll(providers, aiRequest);
    for (const resp of responses) {
      const candidates = parseCandidatesFromResponse(resp, lang);
      providerResults[resp.provider] = {
        generated: candidates.length,
        error: resp.error || undefined,
      };
      allCandidates.push(...candidates);
    }
  } else {
    // Single provider (or sequential)
    const primaryProvider = providers[0];
    const response = await generateWithProvider(primaryProvider, aiRequest);
    const candidates = parseCandidatesFromResponse(response, lang);
    providerResults[primaryProvider] = {
      generated: candidates.length,
      error: response.error || undefined,
    };
    allCandidates = candidates;
  }

  if (allCandidates.length === 0) {
    return NextResponse.json({
      error: "No candidates generated",
      provider_results: providerResults,
    }, { status: 502 });
  }

  // Save to DB if configured
  let saved: unknown[] = [];
  if (saveToDb && SUPABASE_URL && SUPABASE_KEY) {
    const { data } = await supabaseAdmin()
      .from("topic_candidates")
      .insert(allCandidates)
      .select("id, title, slug");
    saved = data ?? [];
  }

  return NextResponse.json({
    topic,
    lang,
    providers_used: Object.keys(providerResults),
    available_providers: available.map((p) => ({ key: p, label: AI_PROVIDERS[p].label })),
    cross_verify: crossVerify,
    provider_results: providerResults,
    total_generated: allCandidates.length,
    saved: saved.length,
    preview: allCandidates.slice(0, 3),
  });
}

export async function GET() {
  const available = getAvailableProviders();
  return NextResponse.json({
    available_providers: available.map((p) => ({
      key: p,
      label: AI_PROVIDERS[p].label,
      model: AI_PROVIDERS[p].model,
      supports_web_search: AI_PROVIDERS[p].supportsWebSearch,
    })),
    supported_languages: ["ko", "en", "hi", "ar", "es", "ja", "zh"],
  });
}
