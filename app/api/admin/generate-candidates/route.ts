import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function buildPrompt(topic: string, count: number) {
  return `
당신은 GYEOL — 한국어 팩트 레지스트리의 콘텐츠 큐레이터입니다.
"${topic}" 관련해서 사람들이 AI에게 자주 묻는 토픽 ${count}개를 웹 검색으로 찾아 생성하세요.

규칙:
- placeholder_value는 반드시 "확인 필요" (절대 실제 숫자/날짜 쓰지 말 것)
- AI가 실제로 자주 틀리는 정보 위주
- 최대한 구체적이고 검색 가능한 토픽
- category는 토픽에 맞게 자유롭게 설정 (제한 없음)

각 토픽을 JSON으로:
{
  "title": "한국어 제목",
  "slug": "ascii-slug",
  "category": "자유 카테고리 (스포츠, 연예, 생활, IT, 금융 등 무엇이든)",
  "subcategory": "세부 분류",
  "risk_tier": "low|medium|high",
  "why_people_ask_ai": "왜 AI에게 묻는가 (1문장)",
  "why_ai_gets_wrong": "AI가 왜 틀리는가 (1문장)",
  "claims": [
    {
      "question": "구체적 질문",
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

export async function POST(request: Request) {
  const auth = request.headers.get("x-admin-secret");
  if (ADMIN_SECRET && auth !== ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const topic = String(body.topic ?? body.category ?? "").trim();
  const count = Math.min(Math.max(parseInt(body.count ?? "10"), 1), 50);
  const saveToDb = body.save !== false;

  if (!topic) {
    return NextResponse.json({ error: "topic 필드가 필요합니다" }, { status: 400 });
  }

  if (!PERPLEXITY_KEY) {
    return NextResponse.json({ error: "PERPLEXITY_API_KEY not set" }, { status: 500 });
  }

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
          content: "You are a Korean fact-registry curator. Search the web and output only valid JSON arrays. Find real Korean official/platform URLs for source_hints. Accept ANY topic: sports, entertainment, life, IT, finance, etc.",
        },
        { role: "user", content: buildPrompt(topic, count) },
      ],
      temperature: 0.3,
      return_citations: true,
    }),
  });

  if (!pplxRes.ok) {
    const err = await pplxRes.text();
    return NextResponse.json({ error: "Perplexity error", detail: err }, { status: 502 });
  }

  const pplxJson = await pplxRes.json();
  const rawText: string = pplxJson.choices?.[0]?.message?.content ?? "";
  const citations: string[] = pplxJson.citations ?? [];

  let candidates: Record<string, unknown>[] = [];
  try {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array");
    const parsed = JSON.parse(match[0]);

    candidates = parsed.map((c: Record<string, unknown>, i: number) => {
      const hints = (c.source_hints as {url:string}[]) ?? [];
      const hintUrls = new Set(hints.map(h => h.url));
      const extra = citations
        .filter(u => !hintUrls.has(u))
        .slice(i * 2, i * 2 + 2)
        .map(u => { try { return { url: u, title: new URL(u).hostname }; } catch { return { url: u, title: u }; } });

      return {
        ...c,
        source: "ai_generated",
        lang: "ko",
        status: "new",
        generation_model: "perplexity-sonar-pro",
        claims: ((c.claims ?? []) as Record<string, unknown>[]).map(cl => ({
          ...cl, placeholder_value: "확인 필요",
        })),
        source_hints: [...hints, ...extra],
      };
    });
  } catch {
    return NextResponse.json({ error: "Parse failed", raw: rawText.slice(0, 500) }, { status: 502 });
  }

  let saved: unknown[] = [];
  if (saveToDb && SUPABASE_URL) {
    const { data } = await supabaseAdmin()
      .from("topic_candidates")
      .insert(candidates)
      .select("id, title, slug");
    saved = data ?? [];
  }

  return NextResponse.json({
    topic,
    generated: candidates.length,
    saved: saved.length,
    citations_found: citations.length,
    preview: candidates.slice(0, 3),
  });
}
