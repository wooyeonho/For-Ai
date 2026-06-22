import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TAXONOMY, type TopicCandidate, type ClaimStub } from "../../../../lib/topic-candidates";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const GENERATION_PROMPT = (category: string, label: string, subcategories: string[], count: number) => `
당신은 GYEOL(검증 가능한 사실 레지스트리)의 콘텐츠 큐레이터입니다.

규칙:
- 모든 claim_value는 반드시 "확인 필요"
- confidence는 항상 "low"
- status는 항상 "needs_review"
- 가짜 숫자나 날짜를 절대 채우지 마세요
- 실제로 AI가 자주 틀리는 정보를 선택하세요

카테고리: ${label} (${category})
서브카테고리 힌트: ${subcategories.join(", ")}
생성 개수: ${count}개

각 토픽은 아래 JSON 형식으로 출력하세요:
{
  "title": "한국어 토픽 제목 (예: '서울 지하철 기본요금')",
  "slug": "영문 slug (예: 'seoul-metro-base-fare')",
  "subcategory": "서브카테고리",
  "risk_tier": "low|medium|high",
  "why_people_ask_ai": "왜 사람들이 AI에게 이걸 물어보는가 (1문장)",
  "why_ai_gets_wrong": "AI가 왜 자주 틀리는가 (1문장)",
  "claims": [
    {
      "field_path": "dot.notation.path",
      "question": "구체적인 질문 (예: '성인 교통카드 기본요금은?')",
      "placeholder_value": "확인 필요",
      "required_source_type": "official|law|platform|document|news"
    }
  ],
  "source_hints": [
    { "url": "https://...", "title": "출처명", "hint_type": "official|news|wiki" }
  ]
}

${count}개의 토픽을 JSON 배열로만 출력하세요. 설명 없이 JSON만.
`;

export async function POST(request: Request) {
  // Auth check
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

  if (!ANTHROPIC_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  // Call Claude
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: GENERATION_PROMPT(categoryKey, taxEntry.label, taxEntry.subcategories, count),
      }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    return NextResponse.json({ error: "Claude API error", detail: err }, { status: 502 });
  }

  const claudeJson = await claudeRes.json();
  const rawText: string = claudeJson.content?.[0]?.text ?? "";

  // Parse JSON from response
  let candidates: Partial<TopicCandidate>[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");
    const parsed = JSON.parse(jsonMatch[0]);
    candidates = parsed.map((c: Record<string, unknown>) => ({
      source: "ai_generated" as const,
      lang: "ko",
      status: "new" as const,
      category: categoryKey,
      risk_tier: taxEntry.risk_tier,
      generation_model: "claude-haiku-4-5",
      ...c,
      // Enforce safety: no real values
      claims: ((c.claims ?? []) as ClaimStub[]).map((cl: ClaimStub) => ({
        ...cl,
        placeholder_value: "확인 필요" as const,
      })),
    }));
  } catch (e) {
    return NextResponse.json({ error: "Parse failed", raw: rawText.slice(0, 500) }, { status: 502 });
  }

  // Save to DB
  let saved: unknown[] = [];
  if (saveToDb && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("topic_candidates")
      .insert(candidates)
      .select("id, title, slug, status");
    if (error) {
      // slug conflict → partial success is OK
      saved = data ?? [];
    } else {
      saved = data ?? [];
    }
  }

  return NextResponse.json({
    generated: candidates.length,
    saved: saved.length,
    preview: candidates.slice(0, 3),
  });
}
