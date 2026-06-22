import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TAXONOMY, type TopicCandidate, type ClaimStub } from "../../../../lib/topic-candidates";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const GENERATION_PROMPT = (
  category: string,
  label: string,
  subcategories: string[],
  count: number
) => `
당신은 GYEOL(검증 가능한 사실 레지스트리)의 콘텐츠 큐레이터입니다.
사람들이 AI에게 자주 묻는 "${label}" 관련 토픽 ${count}개를 생성하세요.

절대 규칙:
- 모든 placeholder_value는 반드시 "확인 필요" (실제 숫자/날짜 입력 금지)
- 실제로 AI가 자주 틀리는 정보 위주로 선택
- 웹 검색으로 실제 공식 출처 URL을 source_hints에 포함

카테고리: ${label} (${category})
서브카테고리 힌트: ${subcategories.join(", ")}

각 토픽을 아래 JSON 형식으로 출력:
{
  "title": "한국어 토픽 제목",
  "slug": "ascii-only-slug",
  "subcategory": "서브카테고리",
  "risk_tier": "low|medium|high",
  "why_people_ask_ai": "왜 사람들이 AI에게 묻는가 (1문장)",
  "why_ai_gets_wrong": "AI가 왜 자주 틀리는가 (1문장)",
  "claims": [
    {
      "field_path": "dot.notation.path",
      "question": "구체적인 질문",
      "placeholder_value": "확인 필요",
      "required_source_type": "official|law|platform|document|news"
    }
  ],
  "source_hints": [
    { "url": "https://실제url", "title": "출처명", "hint_type": "official|news|wiki" }
  ]
}

${count}개를 JSON 배열로만 출력. 설명 없이 JSON만.
`;

export async function POST(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (ADMIN_SECRET && auth !== ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const categoryKey = String(body.category ?? "").trim();
  const count = Math.min(Math.max(parseInt(body.count ?? "10"), 1), 50);
  const saveToDb = body.save !== false;

  const taxEntry = TAXONOMY[categoryKey];
  if (!taxEntry) {
    return NextResponse.json(
      { error: `Unknown category. Valid: ${Object.keys(TAXONOMY).join(", ")}` },
      { status: 400 }
    );
  }

  if (!PERPLEXITY_KEY) {
    return NextResponse.json({ error: "PERPLEXITY_API_KEY not set" }, { status: 500 });
  }

  // Perplexity API — OpenAI-compatible + real-time web search + citations
  const pplxRes = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "You are a Korean fact-registry curator. Output only valid JSON arrays. Search the web for real official Korean government/platform URLs to include as source_hints.",
        },
        {
          role: "user",
          content: GENERATION_PROMPT(categoryKey, taxEntry.label, taxEntry.subcategories, count),
        },
      ],
      temperature: 0.2,
      return_citations: true,
      return_images: false,
    }),
  });

  if (!pplxRes.ok) {
    const err = await pplxRes.text();
    return NextResponse.json({ error: "Perplexity API error", detail: err }, { status: 502 });
  }

  const pplxJson = await pplxRes.json();
  const rawText: string = pplxJson.choices?.[0]?.message?.content ?? "";
  const webCitations: string[] = pplxJson.citations ?? [];

  let candidates: Partial<TopicCandidate>[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");
    const parsed = JSON.parse(jsonMatch[0]);

    candidates = parsed.map((c: Record<string, unknown>, idx: number) => {
      const existingHints = (c.source_hints as { url: string }[]) ?? [];
      const existingUrls = new Set(existingHints.map((h) => h.url));
      const extraHints = webCitations
        .filter((url) => !existingUrls.has(url))
        .slice(idx * 2, idx * 2 + 2)
        .map((url) => {
          try { return { url, title: new URL(url).hostname, hint_type: "web" as const }; }
          catch { return { url, title: url, hint_type: "web" as const }; }
        });

      return {
        source: "ai_generated" as const,
        lang: "ko",
        status: "new" as const,
        category: categoryKey,
        risk_tier: taxEntry.risk_tier,
        generation_model: "perplexity-sonar-pro",
        ...c,
        claims: ((c.claims ?? []) as ClaimStub[]).map((cl: ClaimStub) => ({
          ...cl,
          placeholder_value: "확인 필요" as const,
        })),
        source_hints: [...existingHints, ...extraHints],
      };
    });
  } catch {
    return NextResponse.json(
      { error: "Parse failed", raw: rawText.slice(0, 500) },
      { status: 502 }
    );
  }

  let saved: unknown[] = [];
  if (saveToDb && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("topic_candidates")
      .insert(candidates)
      .select("id, title, slug, status");
    saved = data ?? [];
  }

  return NextResponse.json({
    generated: candidates.length,
    saved: saved.length,
    citations_used: webCitations.length,
    preview: candidates.slice(0, 3),
  });
}
