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
import { buildConsensus, type ConsensusCandidate } from "../../../../lib/consensus";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function supabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
- 공식 출처가 존재하는 주제 우선
- 최대한 구체적이고 검색 가능한 토픽
- category는 토픽에 맞게 자유롭게 설정
- title과 why_people_ask_ai는 ${lang} 언어로 작성
- source_hints는 official/platform/law/document 성격의 출처를 우선 포함

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
    { "url": "https://실제url", "title": "official/platform/law/document 우선 출처명" }
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
  return `You are a global fact-registry curator for GYEOL. Search the web and output only valid JSON arrays. Prioritize topics with official sources. Find real official/platform/law/document URLs for source_hints before other source types. Accept ANY topic: sports, entertainment, life, IT, finance, government, etc. Output in ${language}.`;
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
  let consensusResults: ConsensusCandidate[] | null = null;

  if (crossVerify && providers.length >= 2) {
    // Cross-verification: run all providers, build consensus
    const responses = await generateWithAll(providers, aiRequest);
    const candidatesByProvider = new Map<string, Record<string, unknown>[]>();

    for (const resp of responses) {
      const candidates = parseCandidatesFromResponse(resp, lang);
      providerResults[resp.provider] = {
        generated: candidates.length,
        error: resp.error || undefined,
      };
      if (candidates.length > 0) {
        candidatesByProvider.set(resp.provider, candidates);
      }
    }

    if (candidatesByProvider.size >= 2) {
      consensusResults = buildConsensus(candidatesByProvider, providers.length);
      allCandidates = consensusResults;
    } else {
      // Only one provider returned results — no consensus possible
      for (const candidates of candidatesByProvider.values()) {
        allCandidates.push(...candidates);
      }
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
  let saveError: string | null = null;
  let saveErrorDetails: Record<string, unknown> | null = null;
  const client = supabaseAdmin();

  if (saveToDb && client) {
    // Strip non-DB fields before insert; keep only schema-compatible columns
    const dbRows = allCandidates.map((c) => {
      const row = { ...c } as Record<string, unknown>;
      // Remove consensus metadata that isn't in the DB table columns
      delete row.merged_source_hints;
      delete row.merged_claims;
      delete row.total_providers;
      return row;
    });

    const { data, error } = await client
      .from("topic_candidates")
      .insert(dbRows)
      .select("id, title, slug");

    if (error) {
      saveError = error.message;
      saveErrorDetails = {
        code: error.code,
        details: error.details,
        hint: error.hint,
      };
      console.error("[admin/generate-candidates] Supabase insert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        attempted_rows: dbRows.length,
      });
    } else {
      saved = data ?? [];
    }
  } else if (saveToDb && !client) {
    saveError = "SUPABASE_SERVICE_ROLE_KEY not configured. AI candidates generated but cannot be saved. anon key is not accepted for ai_generated inserts due to RLS policy.";
    saveErrorDetails = {
      missing_env: [
        ...(!SUPABASE_URL ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
        ...(!SUPABASE_SERVICE_ROLE_KEY ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
      ],
    };
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
    save_status: saveToDb
      ? (saveError ? "failed" : "saved")
      : "skipped",
    ...(saveError ? { save_error: saveError } : {}),
    ...(saveErrorDetails ? { save_error_details: saveErrorDetails } : {}),
    ...(consensusResults ? {
      consensus_summary: {
        total_unique: consensusResults.length,
        unanimous: consensusResults.filter((c) => c.consensus_level === "unanimous").length,
        majority: consensusResults.filter((c) => c.consensus_level === "majority").length,
        minority: consensusResults.filter((c) => c.consensus_level === "minority").length,
        single: consensusResults.filter((c) => c.consensus_level === "single").length,
      },
    } : {}),
    preview: allCandidates.slice(0, 5).map((c) => {
      const consensus = c as Record<string, unknown>;
      return {
        ...c,
        ...(consensus.consensus_score !== undefined ? {
          consensus_score: consensus.consensus_score,
          consensus_level: consensus.consensus_level,
          agreed_providers: consensus.agreed_providers,
        } : {}),
      };
    }),
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
