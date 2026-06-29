import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractIp, getContributorSalt, makeContributorHash } from "./contributor-hash";

export type AnalyticsEventType = "read" | "api_cite" | "citation_copy" | "report_submission";
export type CrawlerKind = "human" | "bot" | "ai_crawler";

type SupabaseLike = SupabaseClient;

const AI_CRAWLER_PATTERNS = [
  { pattern: /gptbot/i, name: "GPTBot" },
  { pattern: /chatgpt-user/i, name: "ChatGPT-User" },
  { pattern: /oai-searchbot/i, name: "OAI-SearchBot" },
  { pattern: /claudebot/i, name: "ClaudeBot" },
  { pattern: /claude-web/i, name: "Claude-Web" },
  { pattern: /anthropic-ai/i, name: "Anthropic-AI" },
  { pattern: /perplexitybot/i, name: "PerplexityBot" },
  { pattern: /perplexity-user/i, name: "Perplexity-User" },
  { pattern: /ccbot/i, name: "CCBot" },
  { pattern: /bytespider/i, name: "Bytespider" },
  { pattern: /diffbot/i, name: "Diffbot" },
  { pattern: /cohere-ai/i, name: "cohere-ai" },
  { pattern: /omgili/i, name: "Omgili" },
  { pattern: /youbot/i, name: "YouBot" },
  { pattern: /facebookbot/i, name: "FacebookBot" },
  { pattern: /meta-externalagent/i, name: "Meta-ExternalAgent" },
  { pattern: /applebot-extended/i, name: "Applebot-Extended" },
];

const KNOWN_BOT_PATTERNS = [
  { pattern: /googlebot/i, name: "Googlebot" },
  { pattern: /bingbot/i, name: "Bingbot" },
  { pattern: /slurp/i, name: "Yahoo Slurp" },
  { pattern: /duckduckbot/i, name: "DuckDuckBot" },
  { pattern: /baiduspider/i, name: "Baiduspider" },
  { pattern: /yandexbot/i, name: "YandexBot" },
  { pattern: /applebot/i, name: "Applebot" },
  { pattern: /semrushbot/i, name: "SemrushBot" },
  { pattern: /ahrefsbot/i, name: "AhrefsBot" },
  { pattern: /bot|crawler|spider|scraper/i, name: "GenericBot" },
];

export function classifyUserAgent(userAgent: string | null): { kind: CrawlerKind; crawlerName: string | null } {
  const ua = userAgent ?? "";
  const aiCrawler = AI_CRAWLER_PATTERNS.find((entry) => entry.pattern.test(ua));
  if (aiCrawler) return { kind: "ai_crawler", crawlerName: aiCrawler.name };
  const bot = KNOWN_BOT_PATTERNS.find((entry) => entry.pattern.test(ua));
  if (bot) return { kind: "bot", crawlerName: bot.name };
  return { kind: "human", crawlerName: null };
}

export function safeRequestAnalyticsMetadata(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  let visitorHash: string | null = null;
  try {
    visitorHash = makeContributorHash(extractIp(request), getContributorSalt());
  } catch {
    visitorHash = createHash("sha256").update(`unknown:${userAgent}`).digest("hex").slice(0, 16);
  }
  return {
    visitor_hash: visitorHash,
    user_agent_hash: createHash("sha256").update(userAgent).digest("hex").slice(0, 16),
    ...classifyUserAgent(userAgent),
  };
}

export async function recordDocumentAnalyticsEvent(
  sb: SupabaseLike,
  request: Request,
  slug: string,
  eventType: AnalyticsEventType,
): Promise<{ documentId: string } | null> {
  const { data: doc, error: docError } = await sb
    .from("documents")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (docError) throw docError;
  if (!doc) return null;

  const { kind, crawlerName, visitor_hash, user_agent_hash } = safeRequestAnalyticsMetadata(request);
  const now = new Date().toISOString();

  await sb.from("document_read_events").insert({
    document_id: doc.id,
    event_type: eventType,
    actor_type: kind,
    crawler_name: crawlerName,
    visitor_hash,
    user_agent_hash,
  });

  const { data: existing, error: statsReadError } = await sb
    .from("document_stats")
    .select("view_count, ai_citation_count, human_view_count, bot_view_count, ai_crawler_view_count, api_cite_count, citation_copy_count, report_submission_count")
    .eq("document_id", doc.id)
    .maybeSingle();
  if (statsReadError) throw statsReadError;

  const increments = {
    view_count: eventType === "read" ? 1 : 0,
    ai_citation_count: eventType === "api_cite" || eventType === "citation_copy" ? 1 : 0,
    human_view_count: eventType === "read" && kind === "human" ? 1 : 0,
    bot_view_count: eventType === "read" && kind === "bot" ? 1 : 0,
    ai_crawler_view_count: eventType === "read" && kind === "ai_crawler" ? 1 : 0,
    api_cite_count: eventType === "api_cite" ? 1 : 0,
    citation_copy_count: eventType === "citation_copy" ? 1 : 0,
    report_submission_count: eventType === "report_submission" ? 1 : 0,
  };

  if (existing) {
    await sb.from("document_stats").update({
      view_count: Number(existing.view_count ?? 0) + increments.view_count,
      ai_citation_count: Number(existing.ai_citation_count ?? 0) + increments.ai_citation_count,
      human_view_count: Number(existing.human_view_count ?? 0) + increments.human_view_count,
      bot_view_count: Number(existing.bot_view_count ?? 0) + increments.bot_view_count,
      ai_crawler_view_count: Number(existing.ai_crawler_view_count ?? 0) + increments.ai_crawler_view_count,
      api_cite_count: Number(existing.api_cite_count ?? 0) + increments.api_cite_count,
      citation_copy_count: Number(existing.citation_copy_count ?? 0) + increments.citation_copy_count,
      report_submission_count: Number(existing.report_submission_count ?? 0) + increments.report_submission_count,
      updated_at: now,
    }).eq("document_id", doc.id);
  } else {
    await sb.from("document_stats").insert({ document_id: doc.id, ...increments, updated_at: now });
  }

  return { documentId: doc.id };
}
