import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { documentPageUrl } from "@/lib/urls";

type SupabaseAdminClient = NonNullable<ReturnType<typeof supabaseAdmin>>;
type InboxType = "community_post" | "source_suggestion" | "hallucination_report" | "report" | "topic_suggestion" | "topic_candidate" | "business_correction";
type LinkedDocument = { id: string; title: string | null; slug: string | null; lang: string | null; url: string | null } | null;
type InboxItem = { id: string; type: InboxType; status: string; risk: string; created_at: string | null; title: string; summary: string; linked_document: LinkedDocument; linked_claim_id?: string | null; raw?: Record<string, unknown> };

const DEFAULT_LIMIT = 25;
const HIGH_RISK_CATEGORIES = ["finance", "bank", "insurance", "health", "medical", "medicine", "legal", "law", "realtime", "genomic", "dna"];
const TYPE_TO_TABLE: Record<InboxType, string> = { community_post: "community_posts", source_suggestion: "source_candidates", hallucination_report: "hallucination_reports", report: "reports", topic_suggestion: "topic_suggestions", topic_candidate: "topic_candidates", business_correction: "business_corrections" };
const ACTIONS = new Set(["approve", "reject", "spam", "duplicate", "link_to_claim", "promote_to_source", "create_document"]);

function statusForAction(type: InboxType, action: string): string {
  if (type === "community_post") {
    if (action === "approve") return "published";
    if (action === "spam") return "spam";
    return "hidden";
  }
  if (type === "topic_candidate") {
    if (action === "approve" || action === "create_document") return "approved";
    if (action === "link_to_claim") return "reviewing";
    if (action === "spam") return "spam";
    return "rejected";
  }
  if (type === "source_suggestion" && action === "duplicate") return "duplicate";
  if (action === "approve" || action === "promote_to_source" || action === "create_document") return "accepted";
  if (action === "link_to_claim") return "reviewing";
  if (action === "spam") return "spam";
  return "rejected";
}

function getObject(value: unknown): Record<string, unknown> | null { if (!value || typeof value !== "object") return null; return Array.isArray(value) ? (value[0] as Record<string, unknown> | undefined) ?? null : value as Record<string, unknown>; }
function stringValue(row: Record<string, unknown>, ...keys: string[]): string | null { for (const key of keys) { const value = row[key]; if (typeof value === "string" && value.trim()) return value.trim(); } return null; }
function createdAt(row: Record<string, unknown>): string | null { return stringValue(row, "created_at", "submitted_at", "updated_at"); }
function linkedDocument(doc: Record<string, unknown> | null, documentId?: string | null): LinkedDocument { if (!doc && !documentId) return null; const id = stringValue(doc ?? {}, "id") ?? documentId ?? ""; const slug = stringValue(doc ?? {}, "slug"); const lang = stringValue(doc ?? {}, "lang") ?? DEFAULT_LOCALE; return { id, title: stringValue(doc ?? {}, "title"), slug, lang, url: slug ? documentPageUrl(slug, lang) : null }; }
function inferRisk(type: InboxType, row: Record<string, unknown>): string { const explicit = stringValue(row, "risk", "risk_tier", "priority"); if (explicit) return explicit; const category = stringValue(row, "category", "report_type", "wrong_answer_type", "source_type")?.toLowerCase() ?? ""; if (type === "business_correction") return "business"; if (type === "hallucination_report") return "high"; if (HIGH_RISK_CATEGORIES.some((key) => category.includes(key))) return "high"; if (type === "source_suggestion") return "source"; return "medium"; }
function summarize(row: Record<string, unknown>, ...keys: string[]): string { return stringValue(row, ...keys)?.slice(0, 220) ?? "처리할 상세 내용이 없습니다."; }

function mapItem(type: InboxType, row: Record<string, unknown>): InboxItem {
  const doc = getObject(row.documents); const claim = getObject(row.claims); const claimDoc = getObject(claim?.documents); const documentId = stringValue(row, "document_id") ?? stringValue(claim ?? {}, "document_id"); const document = linkedDocument(doc ?? claimDoc, documentId); const status = stringValue(row, "status") ?? "new";
  const titleByType: Record<InboxType, string> = { community_post: `${stringValue(row, "author_type") ?? "community"} post`, source_suggestion: stringValue(row, "title", "url", "citation") ?? "Source suggestion", hallucination_report: `${stringValue(row, "ai_service") ?? "AI"} hallucination report`, report: `${stringValue(row, "report_type") ?? "correction"} report`, topic_suggestion: stringValue(row, "question", "category") ?? "Topic suggestion", topic_candidate: stringValue(row, "title", "slug") ?? "Topic candidate", business_correction: `${stringValue(row, "field_path") ?? "claim"} correction` };
  const summaryByType: Record<InboxType, string> = { community_post: summarize(row, "content"), source_suggestion: summarize(row, "url", "citation", "title"), hallucination_report: summarize(row, "expected_correction", "ai_answer", "prompt"), report: summarize(row, "message"), topic_suggestion: summarize(row, "reason", "question", "source_url", "related_url"), topic_candidate: summarize(row, "why_people_ask_ai", "why_ai_gets_wrong", "category"), business_correction: summarize(row, "proposed_value", "reason", "source_url") };
  return { id: String(row.id), type, status, risk: inferRisk(type, row), created_at: createdAt(row), title: titleByType[type], summary: summaryByType[type], linked_document: document, linked_claim_id: stringValue(row, "claim_id") ?? stringValue(claim ?? {}, "id"), raw: { category: row.category, source_type: row.source_type, country: row.country, language: row.language ?? row.lang, priority: row.priority } };
}

async function selectOptional(sb: SupabaseAdminClient, type: InboxType, query: string, limit: number) {
  try { const { data, error } = await sb.from(TYPE_TO_TABLE[type]).select(query).order(type === "topic_suggestion" ? "submitted_at" : "created_at", { ascending: false }).limit(limit); if (error) throw error; return { items: (data ?? []).map((row) => mapItem(type, row as unknown as Record<string, unknown>)), error: null as string | null }; }
  catch (error) { return { items: [] as InboxItem[], error: error instanceof Error ? error.message : String(error) }; }
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "admin.inbox.read"); if (adminError) return adminError;
  const sb = supabaseAdmin(); if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  const url = new URL(request.url); const limit = Math.min(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 100);
  const results = await Promise.all([
    selectOptional(sb, "community_post", "id, document_id, author_type, author_name, content, status, created_at, documents(id, title, slug, lang)", limit),
    selectOptional(sb, "source_suggestion", "id, claim_id, source_type, title, url, citation, status, created_at, claims(id, document_id, field_path, documents(id, title, slug, lang))", limit),
    selectOptional(sb, "hallucination_report", "id, document_id, claim_id, ai_service, prompt, ai_answer, expected_correction, wrong_answer_type, status, created_at, documents(id, title, slug, lang)", limit),
    selectOptional(sb, "report", "id, document_id, report_type, message, status, created_at, documents(id, title, slug, lang)", limit),
    selectOptional(sb, "topic_suggestion", "id, question, country, city_region, category, language, reason, related_url, source_url, status, submitted_at", limit),
    selectOptional(sb, "topic_candidate", "id, title, slug, lang, country, category, risk_tier, status, created_at, reviewed_at, promoted_at", limit),
    selectOptional(sb, "business_correction", "id, entity_id, claim_id, field_path, current_value, proposed_value, reason, source_url, priority, status, created_at, claims(id, document_id, documents(id, title, slug, lang))", limit),
  ]);
  const items = results.flatMap((result) => result.items).sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
  const table_errors = Object.fromEntries(results.map((result, index) => [Object.values(TYPE_TO_TABLE)[index], result.error]).filter(([, error]) => error));
  await logAdminAuditEvent(sb, request, "admin.inbox.list", { count: items.length });
  return NextResponse.json({ items, count: items.length, table_errors });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "admin.inbox.update"); if (adminError) return adminError;
  const sb = supabaseAdmin(); if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = String(body.type ?? "") as InboxType; const id = String(body.id ?? "").trim(); const action = String(body.action ?? "").trim();
  if (!TYPE_TO_TABLE[type] || !id || !ACTIONS.has(action)) return NextResponse.json({ error: "valid type, id, and action are required" }, { status: 400 });
  if (action === "promote_to_source") {
    const { data: suggestion, error: fetchError } = await sb.from("source_candidates").select("*").eq("id", id).single();
    if (fetchError || !suggestion) return NextResponse.json({ error: "source suggestion not found" }, { status: 404 });
    if (!suggestion.claim_id) return NextResponse.json({ error: "claim_id is required to promote to source" }, { status: 400 });
    const sourceId = `src-${suggestion.claim_id}-${Date.now()}`;
    const { error: insertError } = await sb.from("claim_sources").insert({ id: sourceId, claim_id: suggestion.claim_id, source_type: suggestion.source_type ?? "web", title: suggestion.title ?? null, url: suggestion.url ?? null, citation: suggestion.citation ?? null, contributor_hash: suggestion.contributor_hash ?? null, observed_at: new Date().toISOString() });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  const updates: Record<string, unknown> = { status: statusForAction(type, action) };
  if (["source_suggestion", "topic_suggestion", "business_correction"].includes(type)) updates.reviewed_at = new Date().toISOString();
  if (type === "community_post") updates.updated_at = new Date().toISOString();
  const { error } = await sb.from(TYPE_TO_TABLE[type]).update(updates).eq("id", id); if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.inbox.update", { inbox_type: type, inbox_action: action, target_id: id }, id);
  return NextResponse.json({ success: true, type, id, action, updates });
}
