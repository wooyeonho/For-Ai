import Link from "next/link";
import type { SupportedLocale } from "../../lib/i18n";
import { documentPageUrl } from "../../lib/urls";
import type { TrendingItem, TrendingResponse } from "../api/trending/route";

async function fetchTrending(lang: string): Promise<TrendingResponse | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key);

    const [statsResult, hallucinationResult] = await Promise.all([
      sb
        .from("document_stats")
        .select("document_id, view_count, ai_citation_count, human_view_count, api_cite_count, citation_copy_count")
        .order("view_count", { ascending: false })
        .limit(100),
      sb
        .from("hallucination_reports")
        .select("document_id")
        .eq("status", "accepted"),
    ]);
    const { data: stats } = statsResult;

    if (!stats || stats.length === 0) return null;

    const docIds = stats.map((s) => s.document_id);
    const { data: docs } = await sb
      .from("documents")
      .select("id, title, slug, lang, category")
      .in("id", docIds)
      .eq("lang", lang);

    const docMap = new Map((docs ?? []).map((d) => [d.id, d]));

    const hallucinationCounts = new Map<string, number>();
    for (const row of hallucinationResult.data ?? []) {
      if (row.document_id) {
        hallucinationCounts.set(row.document_id, (hallucinationCounts.get(row.document_id) ?? 0) + 1);
      }
    }

    const enriched: TrendingItem[] = stats
      .filter((s) => docMap.has(s.document_id))
      .map((s) => {
        const doc = docMap.get(s.document_id)!;
        return {
          document_id: s.document_id,
          slug: doc.slug,
          title: doc.title,
          category: doc.category,
          lang: doc.lang,
          ai_citation_count: Number(s.ai_citation_count ?? 0),
          human_view_count: Number(s.human_view_count ?? s.view_count ?? 0),
          view_count: Number(s.view_count ?? 0),
          api_cite_count: Number(s.api_cite_count ?? 0),
          citation_copy_count: Number(s.citation_copy_count ?? 0),
          hallucination_count: hallucinationCounts.get(s.document_id) ?? 0,
          page_url: documentPageUrl(doc.slug, doc.lang),
        };
      });

    const aiTrending = [...enriched]
      .sort((a, b) =>
        (b.ai_citation_count + b.api_cite_count + b.citation_copy_count) -
        (a.ai_citation_count + a.api_cite_count + a.citation_copy_count)
      )
      .filter((d) => d.ai_citation_count + d.api_cite_count + d.citation_copy_count > 0)
      .slice(0, 8);

    const humanTrending = [...enriched]
      .sort((a, b) => b.human_view_count - a.human_view_count)
      .filter((d) => d.human_view_count > 0)
      .slice(0, 8);

    const hallucinationTrending = [...enriched]
      .sort((a, b) => b.hallucination_count - a.hallucination_count)
      .filter((d) => d.hallucination_count > 0)
      .slice(0, 8);

    return {
      ai_trending: aiTrending,
      human_trending: humanTrending,
      hallucination_trending: hallucinationTrending,
      total_ai_citations: enriched.reduce((s, d) => s + d.ai_citation_count, 0),
      total_human_views: enriched.reduce((s, d) => s + d.human_view_count, 0),
      total_views: enriched.reduce((s, d) => s + d.view_count, 0),
      total_hallucinations: enriched.reduce((s, d) => s + d.hallucination_count, 0),
      generated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function TrendingList({
  items,
  locale,
  emptyLabel,
  metric = "citation",
}: {
  items: TrendingItem[];
  locale: string;
  emptyLabel: string;
  metric?: "citation" | "view" | "hallucination";
}) {
  if (items.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: 0 }}>{emptyLabel}</p>;
  }

  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, idx) => (
        <li key={item.document_id} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              flexShrink: 0,
              width: 22,
              textAlign: "right",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
              color: idx < 3 ? "var(--accent)" : "var(--muted)",
              fontWeight: idx < 3 ? 700 : 400,
            }}
          >
            {idx + 1}
          </span>
          <Link
            href={`/${locale}/wiki/${item.slug}`}
            style={{
              flex: 1,
              fontSize: "0.88rem",
              color: "var(--text)",
              textDecoration: "none",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.title}
          </Link>
          <span
            style={{
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              color: metric === "hallucination" ? "var(--danger)" : "var(--muted)",
            }}
          >
            {metric === "hallucination"
              ? `⚠${item.hallucination_count.toLocaleString()}`
              : item.ai_citation_count + item.api_cite_count + item.citation_copy_count > 0
                ? `✦${(item.ai_citation_count + item.api_cite_count + item.citation_copy_count).toLocaleString()}`
                : `👁${item.human_view_count.toLocaleString()}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

const LABELS: Record<string, { aiTitle: string; humanTitle: string; hallucinationTitle: string; aiEmpty: string; humanEmpty: string; hallucinationEmpty: string; totalAi: string; totalHuman: string; totalHallucination: string }> = {
  ko: {
    aiTitle: "AI 인기 인용",
    humanTitle: "사람 인기 검색",
    hallucinationTitle: "AI 오답 많은 것",
    aiEmpty: "아직 AI 인용 데이터가 없습니다.",
    humanEmpty: "아직 조회 데이터가 없습니다.",
    hallucinationEmpty: "아직 AI 오답 보고가 없습니다.",
    totalAi: "총 AI 인용",
    totalHuman: "총 사람 조회",
    totalHallucination: "총 AI 오답",
  },
  en: {
    aiTitle: "AI citation trending",
    humanTitle: "Human search trending",
    hallucinationTitle: "AI most wrong about",
    aiEmpty: "No AI citation data yet.",
    humanEmpty: "No view data yet.",
    hallucinationEmpty: "No AI hallucination reports yet.",
    totalAi: "Total AI citations",
    totalHuman: "Total human views",
    totalHallucination: "Total AI hallucinations",
  },
  ja: {
    aiTitle: "AI引用ランキング",
    humanTitle: "人気検索",
    hallucinationTitle: "AIが間違えやすいもの",
    aiEmpty: "AIの引用データはまだありません。",
    humanEmpty: "閲覧データはまだありません。",
    hallucinationEmpty: "AIの誤答報告はまだありません。",
    totalAi: "AI引用合計",
    totalHuman: "人間閲覧合計",
    totalHallucination: "AI誤答合計",
  },
  zh: {
    aiTitle: "AI引用热榜",
    humanTitle: "用户热门搜索",
    hallucinationTitle: "AI常犯错误",
    aiEmpty: "暂无AI引用数据。",
    humanEmpty: "暂无浏览数据。",
    hallucinationEmpty: "暂无AI幻觉报告。",
    totalAi: "AI引用总数",
    totalHuman: "用户浏览总数",
    totalHallucination: "AI幻觉总数",
  },
  es: {
    aiTitle: "Tendencias citas IA",
    humanTitle: "Tendencias humanas",
    hallucinationTitle: "Más errores de IA",
    aiEmpty: "Aún no hay datos de citas de IA.",
    humanEmpty: "Aún no hay datos de visitas.",
    hallucinationEmpty: "Aún no hay reportes de alucinaciones.",
    totalAi: "Total citas IA",
    totalHuman: "Total vistas humanas",
    totalHallucination: "Total alucinaciones IA",
  },
  hi: {
    aiTitle: "AI उद्धरण ट्रेंडिंग",
    humanTitle: "लोकप्रिय खोज",
    hallucinationTitle: "AI सबसे गलत",
    aiEmpty: "अभी तक AI उद्धरण डेटा नहीं है।",
    humanEmpty: "अभी तक व्यू डेटा नहीं है।",
    hallucinationEmpty: "अभी तक AI गलती रिपोर्ट नहीं है।",
    totalAi: "कुल AI उद्धरण",
    totalHuman: "कुल मानव दृश्य",
    totalHallucination: "कुल AI गलतियाँ",
  },
  ar: {
    aiTitle: "رائج استشهادات الذكاء الاصطناعي",
    humanTitle: "الرائج لدى البشر",
    hallucinationTitle: "أكثر أخطاء الذكاء الاصطناعي",
    aiEmpty: "لا توجد بيانات استشهاد بالذكاء الاصطناعي بعد.",
    humanEmpty: "لا توجد بيانات مشاهدة بعد.",
    hallucinationEmpty: "لا توجد تقارير هلوسة بعد.",
    totalAi: "إجمالي استشهادات الذكاء الاصطناعي",
    totalHuman: "إجمالي مشاهدات البشر",
    totalHallucination: "إجمالي أخطاء الذكاء الاصطناعي",
  },
};

function getLabels(locale: string) {
  return LABELS[locale] ?? LABELS.en;
}

export async function TrendingWidget({ locale }: { locale: SupportedLocale }) {
  const data = await fetchTrending(locale);
  if (!data) return null;
  if (data.ai_trending.length === 0 && data.human_trending.length === 0 && data.hallucination_trending.length === 0) return null;

  const lbl = getLabels(locale);

  return (
    <section className="registry-panel" aria-labelledby="trending-heading" style={{ padding: "20px 20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h2 id="trending-heading" style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
          트렌딩
        </h2>
        <div style={{ display: "flex", gap: 16, fontSize: "0.76rem", color: "var(--muted)", fontFamily: "var(--font-mono)", flexWrap: "wrap" }}>
          {data.total_ai_citations > 0 && (
            <span>✦ {lbl.totalAi} {data.total_ai_citations.toLocaleString()}</span>
          )}
          {data.total_human_views > 0 && (
            <span>👁 {lbl.totalHuman} {data.total_human_views.toLocaleString()}</span>
          )}
          {data.total_hallucinations > 0 && (
            <span style={{ color: "var(--danger)" }}>⚠ {lbl.totalHallucination} {data.total_hallucinations.toLocaleString()}</span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
        {data.ai_trending.length > 0 && (
          <div>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ✦ {lbl.aiTitle}
            </p>
            <TrendingList items={data.ai_trending} locale={locale} emptyLabel={lbl.aiEmpty} />
          </div>
        )}

        {data.human_trending.length > 0 && (
          <div>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              👁 {lbl.humanTitle}
            </p>
            <TrendingList items={data.human_trending} locale={locale} emptyLabel={lbl.humanEmpty} />
          </div>
        )}

        {data.hallucination_trending.length > 0 && (
          <div>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--danger)",
                fontFamily: "var(--font-mono)",
              }}
            >
              ⚠ {lbl.hallucinationTitle}
            </p>
            <TrendingList items={data.hallucination_trending} locale={locale} emptyLabel={lbl.hallucinationEmpty} metric="hallucination" />
          </div>
        )}
      </div>
    </section>
  );
}
