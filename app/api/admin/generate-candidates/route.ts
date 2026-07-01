import { NextResponse } from "next/server";
import {
  type AIProviderKey,
  AI_PROVIDERS,
  getAvailableProviders,
  generateWithProvider,
  generateWithAll,
  type AIGenerateResponse,
} from "../../../../lib/ai-providers";
import { buildConsensus, type ConsensusCandidate } from "../../../../lib/consensus";
import { logAdminAuditEvent, missingSupabaseAdminEnv, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "@/lib/i18n/locales";

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
당신은 For-Ai — 글로벌 팩트 레지스트리의 콘텐츠 큐레이터입니다.
${instruction}

규칙:
- placeholder_value는 반드시 "확인 필요" (절대 실제 숫자/날짜 쓰지 말 것)
- AI가 실제로 자주 틀리는 정보 위주
- 공식 출처가 존재하는 주제 우선
- 최대한 구체적이고 검색 가능한 토픽
- category는 토픽에 맞게 자유롭게 설정
- title과 why_people_ask_ai는 ${lang} 언어로 작성
- source_hints는 official/platform/law/document 출처를 우선하고, 각 후보마다 가능한 한 최소 1개 이상 포함

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
      "required_source_type": "official|platform|law|document"
    }
  ],
  "source_hints": [
    { "url": "https://실제url", "title": "출처명" }
  ],
  "country": "ISO 3166-1 alpha-2 country code or global"
}

${count}개를 JSON 배열로만. 설명 없이 JSON만.
`.trim();
}


function selectDefaultProvider(available: AIProviderKey[]): AIProviderKey {
  return available.find((provider) => provider === "perplexity")
    ?? available.find((provider) => provider.startsWith("nvidia_"))
    ?? available[0];
}

function defaultCountryForLang(lang: string): string {
  return isValidLocale(lang) ? LOCALE_CONFIG[lang].country : "global";
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
  return `You are a global fact-registry curator for For-Ai. Search the web and output only valid JSON arrays. Prioritize topics with official sources. Find real official/platform/law/document URLs for source_hints, and prefer those source types over news, stats, blogs, or forums. Accept ANY topic: sports, entertainment, life, IT, finance, government, etc. Output in ${language}.`;
}

const UNKNOWN_VALUE = "확인 필요";
const GENERATED_CLAIM_STATUS = "needs_review" as const;
const GENERATED_CONFIDENCE = "low" as const;
const OFFICIAL_SOURCE_HOST_HINTS = [".gov", ".go.", ".gob.", ".gouv.", ".edu", ".ac.", "who.int", "europa.eu", "un.org"];

type ParsedCandidates = { candidates: Record<string, unknown>[]; parseError?: string };

function assessSourceTrust(sourceHints: Record<string, string>[]): {
  source_trust_level: "official" | "traceable" | "needs_review";
  source_trust_reason: string;
  source_hints: Record<string, string>[];
} {
  if (sourceHints.length === 0) {
    return {
      source_trust_level: "needs_review",
      source_trust_reason: "No source_hints were generated; human verification is required.",
      source_hints: sourceHints,
    };
  }

  const enriched = sourceHints.map((hint) => {
    const url = String(hint.url ?? "").trim();
    let hostname = "";
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      // Keep malformed URLs traceable for review instead of dropping them.
    }
    const looksOfficial = OFFICIAL_SOURCE_HOST_HINTS.some((officialHint) => hostname.includes(officialHint));
    return {
      ...hint,
      source_trust: looksOfficial ? "official_like" : "traceable_unverified",
    };
  });
  const hasOfficial = enriched.some((hint) => hint.source_trust === "official_like");

  return {
    source_trust_level: hasOfficial ? "official" : "traceable",
    source_trust_reason: hasOfficial
      ? "At least one generated source hint appears to be an official/public-interest domain; human verification is still required."
      : "Generated source hints are traceable but not recognized as official domains; human verification is required.",
    source_hints: enriched,
  };
}

function parseCandidatesFromResponse(
  response: AIGenerateResponse,
  lang: string
): ParsedCandidates {
  if (response.error || !response.content) return { candidates: [] };

  const match = response.content.match(/\[[\s\S]*\]/);
  if (!match) {
    const preview = response.content.trim().slice(0, 120).replace(/\s+/g, " ");
    console.warn("[admin/generate-candidates] no JSON array found in response", {
      provider: response.provider,
      model: response.model,
      content_preview: preview,
    });
    return { candidates: [], parseError: `JSON 배열을 찾지 못함 (응답 앞부분: ${preview || "빈 응답"})` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[admin/generate-candidates] JSON.parse failed", {
      provider: response.provider,
      model: response.model,
      reason,
      matched_length: match[0].length,
    });
    return { candidates: [], parseError: `JSON 파싱 실패: ${reason}` };
  }

  if (!Array.isArray(parsed)) {
    return { candidates: [], parseError: "JSON이 배열 형식이 아님" };
  }

  try {
    const candidates = parsed.map((c: Record<string, unknown>) => {
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

      const sourceTrust = assessSourceTrust([...hints, ...extra]);

      return {
        ...c,
        source: "ai_generated",
        lang,
        country: String(c.country ?? "").trim() || defaultCountryForLang(lang),
        status: "new",
        generation_model: `${response.provider}/${response.model}`,
        claims: ((c.claims ?? []) as Record<string, unknown>[]).map((cl, index) => {
          const claim = { ...cl } as Record<string, unknown>;
          delete claim.sources;
          delete claim.claim_sources;
          delete claim.source_hints;
          return {
            ...claim,
            field_path: String(claim.field_path ?? `claim.${index + 1}`).trim() || `claim.${index + 1}`,
            claim_text: String(claim.claim_text ?? claim.question ?? claim.field_path ?? UNKNOWN_VALUE).trim() || UNKNOWN_VALUE,
            claim_value: UNKNOWN_VALUE,
            placeholder_value: UNKNOWN_VALUE,
            confidence: GENERATED_CONFIDENCE,
            status: GENERATED_CLAIM_STATUS,
          };
        }),
        source_hints: sourceTrust.source_hints,
      };
    });
    return { candidates };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[admin/generate-candidates] candidate normalization failed", {
      provider: response.provider,
      model: response.model,
      reason,
    });
    return { candidates: [], parseError: `후보 정규화 실패: ${reason}` };
  }
}

function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龥]+/g, " ")
    .trim();
}

function tokenize(value: unknown): Set<string> {
  return new Set(normalizeForMatch(value).split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((v) => b.has(v)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function candidateSimilarity(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const slugA = normalizeForMatch(a.slug).replace(/\s+/g, "-");
  const slugB = normalizeForMatch(b.slug).replace(/\s+/g, "-");
  const slugScore = slugA && slugA === slugB ? 1 : jaccard(tokenize(slugA.replace(/-/g, " ")), tokenize(slugB.replace(/-/g, " ")));
  const titleScore = jaccard(tokenize(a.title), tokenize(b.title));
  return Math.max(slugScore, titleScore * 0.92);
}

function consensusLevel(score: number): "unanimous" | "majority" | "minority" | "single" {
  if (score >= 0.9) return "unanimous";
  if (score >= 0.55) return "majority";
  if (score > 0) return "minority";
  return "single";
}

function mergeSourceHints(candidates: Record<string, unknown>[]): Record<string, string>[] {
  const merged = new Map<string, Record<string, string>>();
  for (const candidate of candidates) {
    for (const hint of (candidate.source_hints as Record<string, string>[] | undefined) ?? []) {
      const url = String(hint.url ?? "").trim();
      if (!url || merged.has(url)) continue;
      merged.set(url, { url, title: String(hint.title ?? url) });
    }
  }
  return [...merged.values()];
}

function applyConsensus(
  candidates: Record<string, unknown>[],
  providerCount: number
): { candidates: Record<string, unknown>[]; summary: Record<string, unknown> } {
  const groups: Record<string, unknown>[][] = [];

  for (const candidate of candidates) {
    const best = groups
      .map((group, index) => ({ index, score: Math.max(...group.map((existing) => candidateSimilarity(candidate, existing))) }))
      .sort((a, b) => b.score - a.score)[0];

    if (best && best.score >= 0.5) groups[best.index].push(candidate);
    else groups.push([candidate]);
  }

  const enriched = groups.flatMap((group) => {
    const providers = [...new Set(group.map((c) => String(c.generation_model ?? "").split("/")[0]).filter(Boolean))];
    const supportRatio = providerCount > 0 ? providers.length / providerCount : 0;
    const similarity = group.length > 1
      ? group.reduce((sum, current, index) => sum + (index === 0 ? 1 : candidateSimilarity(group[0], current)), 0) / group.length
      : 0;
    const score = Math.min(1, Math.round((supportRatio * 0.7 + similarity * 0.3) * 100) / 100);
    const level = consensusLevel(score);
    const sourceHints = mergeSourceHints(group);

    return group.map((candidate) => ({
      ...candidate,
      consensus_score: score,
      consensus_level: level,
      consensus_sources: providers,
      source_hints: sourceHints,
    }));
  });

  const levels = enriched.reduce<Record<string, number>>((acc, candidate) => {
    const level = String(candidate.consensus_level ?? "low");
    acc[level] = (acc[level] ?? 0) + 1;
    return acc;
  }, {});

  return {
    candidates: enriched,
    summary: {
      provider_count: providerCount,
      candidate_count: candidates.length,
      consensus_group_count: groups.length,
      levels,
    },
  };
}

async function generateCandidateBatch(
  providers: AIProviderKey[],
  aiRequest: { systemPrompt: string; userPrompt: string; temperature: number },
  lang: string,
  crossVerify: boolean
): Promise<{
  candidates: Record<string, unknown>[];
  providerResults: Record<string, { generated: number; error?: string; parse_error?: string }>;
  consensusResults: ConsensusCandidate[] | null;
  consensusSummary: Record<string, unknown> | null;
}> {
  const providerResults: Record<string, { generated: number; error?: string; parse_error?: string }> = {};
  let allCandidates: Record<string, unknown>[] = [];
  let consensusResults: ConsensusCandidate[] | null = null;
  let consensusSummary: Record<string, unknown> | null = null;

  if (crossVerify && providers.length >= 2) {
    const responses = await generateWithAll(providers, aiRequest);
    const candidatesByProvider = new Map<string, Record<string, unknown>[]>();

    for (const resp of responses) {
      const { candidates, parseError } = parseCandidatesFromResponse(resp, lang);
      providerResults[resp.provider] = {
        generated: candidates.length,
        error: resp.error || undefined,
        parse_error: parseError,
      };
      if (candidates.length > 0) {
        candidatesByProvider.set(resp.provider, candidates);
      }
    }

    if (candidatesByProvider.size >= 2) {
      consensusResults = buildConsensus(candidatesByProvider, providers.length);
      allCandidates = consensusResults;
    } else {
      for (const candidates of candidatesByProvider.values()) {
        allCandidates.push(...candidates);
      }
    }

    const consensus = applyConsensus(allCandidates, providers.length);
    allCandidates = consensus.candidates;
    consensusSummary = consensus.summary;
  } else {
    const primaryProvider = providers[0];
    const response = await generateWithProvider(primaryProvider, aiRequest);
    const { candidates, parseError } = parseCandidatesFromResponse(response, lang);
    providerResults[primaryProvider] = {
      generated: candidates.length,
      error: response.error || undefined,
      parse_error: parseError,
    };
    allCandidates = candidates;
  }

  return { candidates: allCandidates, providerResults, consensusResults, consensusSummary };
}

async function filterDuplicateCandidates(
  candidates: Record<string, unknown>[],
  client: ReturnType<typeof supabaseAdmin>
): Promise<{ deduped: Record<string, unknown>[]; skippedDuplicates: number }> {
  if (!client) return { deduped: candidates, skippedDuplicates: 0 };

  const candidateSlugs = candidates.map((c) => String(c.slug ?? "")).filter(Boolean);
  const { data: existingRows } = await client
    .from("topic_candidates")
    .select("slug")
    .in("slug", candidateSlugs);
  const existingSlugs = new Set(existingRows?.map((r) => r.slug) ?? []);
  const deduped = candidates.filter((c) => !existingSlugs.has(String(c.slug ?? "")));

  return {
    deduped,
    skippedDuplicates: candidates.length - deduped.length,
  };
}

function toTopicCandidateDbRows(candidates: Record<string, unknown>[]): Record<string, unknown>[] {
  return candidates.map((c) => {
    const row = { ...c } as Record<string, unknown>;
    delete row.merged_source_hints;
    delete row.merged_claims;
    delete row.total_providers;
    delete row.consensus_sources;
    delete row.agreed_providers;
    return row;
  });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "candidates.generate");
  if (adminError) return adminError;

  const body = await request.json();
  const topic = String(body.topic ?? body.category ?? "").trim();
  const count = Math.min(Math.max(parseInt(body.count ?? "10"), 1), 50);
  const lang = String(body.lang ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE;
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
    // Default provider policy: prefer Perplexity for web search, then NVIDIA, then other configured providers.
    providers = [selectDefaultProvider(available)];
  }

  const systemPrompt = buildSystemPrompt(lang);
  const userPrompt = buildPrompt(topic, count, lang);
  const aiRequest = { systemPrompt, userPrompt, temperature: 0.3 };

  const {
    candidates: allCandidates,
    providerResults,
    consensusResults,
    consensusSummary,
  } = await generateCandidateBatch(providers, aiRequest, lang, crossVerify);

  if (allCandidates.length === 0) {
    const parseErrors = Object.entries(providerResults)
      .filter(([, r]) => r.parse_error)
      .map(([provider, r]) => `${provider}: ${r.parse_error}`);
    const apiErrors = Object.entries(providerResults)
      .filter(([, r]) => r.error)
      .map(([provider, r]) => `${provider}: ${r.error}`);
    const reason = parseErrors.length > 0
      ? `AI 응답을 파싱하지 못했습니다 — ${parseErrors.join(" / ")}`
      : apiErrors.length > 0
        ? `AI 호출 실패 — ${apiErrors.join(" / ")}`
        : "AI가 후보를 생성하지 못했습니다 (다른 토픽으로 다시 시도해 보세요)";
    return NextResponse.json({
      error: reason,
      provider_results: providerResults,
      providers_used: Object.keys(providerResults),
      fallback_used: false,
    }, { status: 502 });
  }

  // Save to DB if configured
  let saved: unknown[] = [];
  let saveError: string | null = null;
  let saveErrorDetails: Record<string, unknown> | null = null;
  let skippedDuplicates = 0;
  const client = supabaseAdmin();

  if (saveToDb && client) {
    const duplicateFilter = await filterDuplicateCandidates(allCandidates, client);
    const deduped = duplicateFilter.deduped;
    skippedDuplicates = duplicateFilter.skippedDuplicates;

    const dbRows = toTopicCandidateDbRows(deduped);

    if (dbRows.length === 0) {
      saved = [];
      await logAdminAuditEvent(client, request, "admin.generate_candidates", {
        topic, lang, saved_count: 0, skipped_duplicates: skippedDuplicates,
        providers_used: Object.keys(providerResults), cross_verify: crossVerify,
      });
      return NextResponse.json({
        topic, lang,
        providers_used: Object.keys(providerResults),
        available_providers: available.map((p) => ({ key: p, label: AI_PROVIDERS[p].label })),
        cross_verify: crossVerify,
        provider_results: providerResults,
        fallback_used: false,
        total_generated: allCandidates.length,
        saved: 0,
        skipped_duplicates: skippedDuplicates,
        save_status: "skipped_all_duplicates",
        preview: [],
      });
    }

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
      await logAdminAuditEvent(client, request, "admin.generate_candidates", {
        topic,
        lang,
        saved_count: saved.length,
        skipped_duplicates: skippedDuplicates,
        providers_used: Object.keys(providerResults),
        cross_verify: crossVerify,
      });
    }
  } else if (saveToDb && !client) {
    saveError = "SUPABASE_SERVICE_ROLE_KEY not configured. AI candidates generated but cannot be saved. anon key is not accepted for ai_generated inserts due to RLS policy.";
    saveErrorDetails = {
      missing_env: missingSupabaseAdminEnv(),
    };
  }

  return NextResponse.json({
    topic,
    lang,
    providers_used: Object.keys(providerResults),
    available_providers: available.map((p) => ({ key: p, label: AI_PROVIDERS[p].label })),
    cross_verify: crossVerify,
    provider_results: providerResults,
    fallback_used: false,
    ...(consensusSummary ? { consensus_summary: consensusSummary } : {}),
    total_generated: allCandidates.length,
    saved: saved.length,
    ...(saveToDb ? { skipped_duplicates: skippedDuplicates } : {}),
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

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "candidates.generate_metadata");
  if (adminError) return adminError;
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
