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

    const { data: stats } = await sb
      .from("document_stats")
      .select("document_id, view_count, ai_citation_count, human_view_count, api_cite_count, citation_copy_count")
      .order("view_count", { ascending: false })
      .limit(100);

    if (!stats || stats.length === 0) return null;

    const docIds = stats.map((s) => s.document_id);
    const { data: docs } = await sb
      .from("documents")
      .select("id, title, slug, lang, category")
      .in("id", docIds)
      .eq("lang", lang);

    const docMap = new Map((docs ?? []).map((d) => [d.id, d]));

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

    return {
      ai_trending: aiTrending,
      human_trending: humanTrending,
      total_ai_citations: enriched.reduce((s, d) => s + d.ai_citation_count, 0),
      total_human_views: enriched.reduce((s, d) => s + d.human_view_count, 0),
      total_views: enriched.reduce((s, d) => s + d.view_count, 0),
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
}: {
  items: TrendingItem[];
  locale: string;
  emptyLabel: string;
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
              color: "var(--muted)",
            }}
          >
            {item.ai_citation_count + item.api_cite_count + item.citation_copy_count > 0
              ? `✦${(item.ai_citation_count + item.api_cite_count + item.citation_copy_count).toLocaleString()}`
              : `👁${item.human_view_count.toLocaleString()}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

const LABELS: Record<string, { aiTitle: string; humanTitle: string; aiEmpty: string; humanEmpty: string; totalAi: string; totalHuman: string }> = {
  ko: {
    aiTitle: "AI 인기 검색",
    humanTitle: "사람 인기 검색",
    aiEmpty: "아직 AI 인용 데이터가 없습니다.",
    humanEmpty: "아직 조회 데이터가 없습니다.",
    totalAi: "총 AI 인용",
    totalHuman: "총 사람 조회",
  },
  en: {
    aiTitle: "AI trending",
    humanTitle: "Human trending",
    aiEmpty: "No AI citation data yet.",
    humanEmpty: "No view data yet.",
    totalAi: "Total AI citations",
    totalHuman: "Total human views",
  },
  ja: {
    aiTitle: "AI人気検索",
    humanTitle: "人気検索",
    aiEmpty: "AIの引用データはまだありません。",
    humanEmpty: "閲覧データはまだありません。",
    totalAi: "AI引用合計",
    totalHuman: "人間閲覧合計",
  },
  zh: {
    aiTitle: "AI热门搜索",
    humanTitle: "用户热门搜索",
    aiEmpty: "暂无AI引用数据。",
    humanEmpty: "暂无浏览数据。",
    totalAi: "AI引用总数",
    totalHuman: "用户浏览总数",
  },
  es: {
    aiTitle: "Tendencias IA",
    humanTitle: "Tendencias humanas",
    aiEmpty: "Aún no hay datos de citas de IA.",
    humanEmpty: "Aún no hay datos de visitas.",
    totalAi: "Total citas IA",
    totalHuman: "Total vistas humanas",
  },
  hi: {
    aiTitle: "AI ट्रेंडिंग",
    humanTitle: "लोकप्रिय खोज",
    aiEmpty: "अभी तक AI उद्धरण डेटा नहीं है।",
    humanEmpty: "अभी तक व्यू डेटा नहीं है।",
    totalAi: "कुल AI उद्धरण",
    totalHuman: "कुल मानव दृश्य",
  },
  ar: {
    aiTitle: "الرائج لدى الذكاء الاصطناعي",
    humanTitle: "الرائج لدى البشر",
    aiEmpty: "لا توجد بيانات استشهاد بالذكاء الاصطناعي بعد.",
    humanEmpty: "لا توجد بيانات مشاهدة بعد.",
    totalAi: "إجمالي استشهادات الذكاء الاصطناعي",
    totalHuman: "إجمالي مشاهدات البشر",
  },
};

function getLabels(locale: string) {
  return LABELS[locale] ?? LABELS.en;
}

export async function TrendingWidget({ locale }: { locale: SupportedLocale }) {
  const data = await fetchTrending(locale);
  if (!data) return null;
  if (data.ai_trending.length === 0 && data.human_trending.length === 0) return null;

  const lbl = getLabels(locale);

  return (
    <section className="registry-panel" aria-labelledby="trending-heading" style={{ padding: "20px 20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <h2 id="trending-heading" style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
          트렌딩
        </h2>
        <div style={{ display: "flex", gap: 16, fontSize: "0.76rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          {data.total_ai_citations > 0 && (
            <span>✦ {lbl.totalAi} {data.total_ai_citations.toLocaleString()}</span>
          )}
          {data.total_human_views > 0 && (
            <span>👁 {lbl.totalHuman} {data.total_human_views.toLocaleString()}</span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
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
      </div>
    </section>
  );
}
