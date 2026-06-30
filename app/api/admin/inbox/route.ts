import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

type InboxType = "community_posts" | "source_suggestions" | "hallucination_reports" | "reports" | "topic_suggestions" | "topic_candidates";
type RawRow = Record<string, unknown>;
type InboxItem = { id: string; type: InboxType; status: string; risk: string; linked_document: string | null; linked_claim: string | null; created_at: string; title: string; summary: string; actions: string[]; raw: RawRow };

const TABLES: Array<{ type: InboxType; created: string; actions: string[] }> = [
  { type: "community_posts", created: "created_at", actions: ["approve", "reject", "spam", "link_to_claim"] },
  { type: "source_suggestions", created: "created_at", actions: ["approve", "reject", "spam", "link_to_claim", "promote_to_source"] },
  { type: "hallucination_reports", created: "created_at", actions: ["approve", "reject", "spam", "link_to_claim"] },
  { type: "reports", created: "created_at", actions: ["approve", "reject", "spam", "link_to_claim"] },
  { type: "topic_suggestions", created: "submitted_at", actions: ["approve", "reject", "spam", "create_document"] },
  { type: "topic_candidates", created: "created_at", actions: ["approve", "reject", "spam", "create_document"] },
];
const OPEN_STATUSES = ["new", "pending", "spam_suspected", "generated", "triaged"];

function text(value: unknown): string { return typeof value === "string" ? value : value == null ? "" : String(value); }
function firstText(row: RawRow, keys: string[]): string { for (const key of keys) { const value = text(row[key]).trim(); if (value) return value; } return ""; }
function riskFor(type: InboxType, row: RawRow): string { return firstText(row, ["risk", "risk_tier", "wrong_answer_type", "report_type"]) || (type === "hallucination_reports" || type === "reports" ? "high" : type === "source_suggestions" ? "medium" : "low"); }
function titleFor(type: InboxType, row: RawRow): string {
  if (type === "community_posts") return firstText(row, ["author_name", "author_type"]) || "Community post";
  if (type === "source_suggestions") return firstText(row, ["title", "url", "citation"]) || "Source suggestion";
  if (type === "hallucination_reports") return firstText(row, ["ai_service", "wrong_answer_type"]) || "Hallucination report";
  if (type === "reports") return firstText(row, ["report_type"]) || "Report";
  if (type === "topic_suggestions") return firstText(row, ["question", "category"]) || "Topic suggestion";
  return firstText(row, ["title", "slug", "category"]) || "Topic candidate";
}
function summaryFor(type: InboxType, row: RawRow): string { return (firstText(row, ["content", "message", "reason", "expected_correction", "ai_answer", "why_people_ask_ai", "url"]) || `${type} submission`).slice(0, 280); }
function normalizeItem(type: InboxType, row: RawRow, actions: string[], createdKey: string): InboxItem {
  return { id: text(row.id), type, status: text(row.status) || "unknown", risk: riskFor(type, row), linked_document: firstText(row, ["document_id", "document_slug", "slug"]) || null, linked_claim: firstText(row, ["claim_id"]) || null, created_at: text(row[createdKey] ?? row.created_at ?? row.submitted_at), title: titleFor(type, row), summary: summaryFor(type, row), actions, raw: row };
}

async function fetchTable(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, config: typeof TABLES[number], status: string, limit: number) {
  let query = sb.from(config.type).select("*").order(config.created, { ascending: false }).limit(limit);
  if (status !== "all") query = status === "open" ? query.in("status", OPEN_STATUSES) : query.eq("status", status);
  const { data, error } = await query;
  if (error) return { items: [] as InboxItem[], error: `${config.type}: ${error.message}` };
  return { items: (data ?? []).map((row) => normalizeItem(config.type, row as RawRow, config.actions, config.created)), error: null };
}
function statusForAction(type: InboxType, action: string): string | null {
  if (action === "spam") return "spam";
  if (type === "community_posts") return action === "approve" ? "published" : action === "reject" ? "hidden" : null;
  if (type === "topic_candidates") return action === "approve" ? "triaged" : action === "reject" ? "rejected" : null;
  return action === "approve" ? "accepted" : action === "reject" ? "rejected" : null;
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "inbox.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "open";
  const typeFilter = searchParams.get("type") ?? "all";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const configs = TABLES.filter((config) => typeFilter === "all" || config.type === typeFilter);
  const results = await Promise.all(configs.map((config) => fetchTable(sb, config, status, limit)));
  const items = results.flatMap((result) => result.items).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit);
  const errors = results.map((result) => result.error).filter(Boolean);
  await logAdminAuditEvent(sb, request, "admin.inbox.list", { status, type: typeFilter, result_count: items.length });
  return NextResponse.json({ items, count: items.length, errors });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "inbox.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  let body: RawRow;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = text(body.type) as InboxType, id = text(body.id).trim(), action = text(body.action).trim();
  if (!TABLES.some((config) => config.type === type) || !id || !action) return NextResponse.json({ error: "valid type, id and action are required" }, { status: 400 });
  if (action === "link_to_claim") {
    const claimId = text(body.claim_id).trim();
    if (!claimId) return NextResponse.json({ error: "claim_id is required" }, { status: 400 });
    if (type !== "source_suggestions" && type !== "hallucination_reports") return NextResponse.json({ error: "this item type cannot be linked directly to a claim" }, { status: 400 });
    const { error } = await sb.from(type).update({ claim_id: claimId }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAdminAuditEvent(sb, request, "admin.inbox.link_to_claim", { item_type: type, item_id: id, target_id: claimId }, id);
    return NextResponse.json({ success: true });
  }
  if (action === "promote_to_source") {
    if (type !== "source_suggestions") return NextResponse.json({ error: "promote_to_source is only available for source_suggestions" }, { status: 400 });
    const { data: suggestion, error: fetchError } = await sb.from("source_suggestions").select("*").eq("id", id).single();
    if (fetchError || !suggestion) return NextResponse.json({ error: "source suggestion not found" }, { status: 404 });
    if (!suggestion.claim_id) return NextResponse.json({ error: "claim_id is required before promotion" }, { status: 400 });
    const sourceId = `src-${suggestion.claim_id}-${Date.now()}`;
    const { error: sourceError } = await sb.from("claim_sources").insert({ id: sourceId, claim_id: suggestion.claim_id, source_type: suggestion.source_type ?? "web", title: suggestion.title, url: suggestion.url, citation: suggestion.citation, contributor_hash: suggestion.contributor_hash, observed_at: new Date().toISOString() });
    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
    await sb.from("source_suggestions").update({ status: "accepted", reviewed_at: new Date().toISOString() }).eq("id", id);
    await logAdminAuditEvent(sb, request, "admin.inbox.promote_to_source", { item_id: id, claim_source_id: sourceId }, id);
    return NextResponse.json({ success: true, claim_source_id: sourceId });
  }
  if (action === "create_document") return NextResponse.json({ error: type === "topic_candidates" ? "Use /api/admin/promote-candidate after AI claim generation to create a document." : "create_document currently requires a topic_candidate" }, { status: 409 });
  const nextStatus = statusForAction(type, action);
  if (!nextStatus) return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  const { error } = await sb.from(type).update({ status: nextStatus }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.inbox.update", { item_type: type, item_id: id, action, status: nextStatus }, id);
  return NextResponse.json({ success: true, status: nextStatus });
}
