import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ImportClaim = { field_path?: string; claim_text?: string; question?: string; claim_value?: string; confidence?: string; status?: string; required_source_type?: string };
type ImportRow = {
  entity_id?: string; id?: string; type?: string; name?: string; canonical_name?: string; slug?: string; lang?: string; country?: string; jurisdiction?: string; title?: string; category?: string; subcategory?: string; template?: string; claims?: ImportClaim[]; source_hints?: JsonValue[]; localized_title?: Record<string, string>; region?: string; city?: string; risk_tier?: string; update_frequency?: string; disclaimer_type?: string; why_people_ask_ai?: string; why_ai_gets_wrong?: string; source_authority?: string; translation_status?: string; generation_model?: string;
};

type ImportTarget = "canonical" | "topic_candidates";

const TOPIC_CANDIDATE_DIR = path.join(process.cwd(), "data", "topic-candidates");

function stableId(prefix: string, value: string): string { return `${prefix}-${value}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120); }
function required(row: ImportRow): string[] {
  return ["entity_id", "type", "slug", "category", "country"].filter((key) => !String(row[key as keyof ImportRow] ?? "").trim()).concat(String(row.title ?? row.name ?? "").trim() ? [] : ["title"]);
}
function needsReviewClaim(claim: ImportClaim, claimIndex: number) {
  const fieldPath = String(claim.field_path ?? `claim.${claimIndex + 1}`).trim();
  return {
    ...claim,
    field_path: fieldPath,
    claim_text: String(claim.claim_text ?? claim.question ?? fieldPath ?? "Needs verification").trim(),
    claim_value: "Needs verification",
    confidence: "low",
    status: "needs_review",
  };
}
function normalize(row: ImportRow, index: number) {
  const entityId = String(row.entity_id ?? row.id ?? "").trim();
  const slug = String(row.slug ?? "").trim();
  const lang = String(row.lang ?? "ko").trim() || "ko";
  const country = String(row.country ?? "").trim().toUpperCase();
  const jurisdiction = String(row.jurisdiction ?? country).trim().toUpperCase() || country;
  const documentId = stableId("doc", `${slug}-${lang}`);
  const claims = Array.isArray(row.claims) && row.claims.length > 0 ? row.claims : [{ field_path: "claim.main", claim_text: String(row.title ?? slug) }];
  return {
    entity: { id: entityId, type: String(row.type ?? row.category ?? "").trim(), canonical_name: String(row.canonical_name ?? row.name ?? row.title ?? "").trim(), country },
    document: { id: documentId, entity_id: entityId, slug, lang, country, title: String(row.title ?? row.name ?? "").trim(), category: String(row.category ?? row.type ?? "").trim(), template: String(row.template ?? "fact-sheet").trim() || "fact-sheet", status: "needs_review", confidence: "low", data: {} },
    claims: claims.map((claim, claimIndex) => ({ id: stableId("claim", `${slug}-${index + 1}-${claimIndex + 1}`), document_id: documentId, entity_id: entityId, ...needsReviewClaim(claim, claimIndex), claim_value: "확인 필요", jurisdiction, confidence: "low", status: "needs_review" })),
    listing: { id: stableId("listing", `${slug}-${lang}`), entity_id: entityId, document_id: documentId, lang, slug, title: String(row.title ?? row.name ?? "").trim(), summary: "Import candidate: 확인 필요", status: "needs_review", confidence: "low" },
  };
}
function normalizeTopicCandidate(row: ImportRow) {
  const claims = (Array.isArray(row.claims) && row.claims.length > 0 ? row.claims : [{ field_path: "claim.main", claim_text: String(row.title ?? row.name ?? row.slug ?? "Needs verification") }]).map(needsReviewClaim);
  const country = String(row.country ?? "global").trim().toUpperCase();
  return {
    status: "new",
    source: "admin_created",
    lang: String(row.lang ?? "en").trim() || "en",
    country,
    title: String(row.title ?? row.name ?? "").trim(),
    slug: String(row.slug ?? "").trim(),
    category: String(row.category ?? row.type ?? "").trim(),
    subcategory: row.subcategory ? String(row.subcategory).trim() : null,
    region: row.region ? String(row.region).trim() : null,
    city: row.city ? String(row.city).trim() : null,
    canonical_slug: String(row.slug ?? "").trim(),
    localized_title: row.localized_title ?? {},
    jurisdiction: String(row.jurisdiction ?? country).trim().toUpperCase() || country,
    source_authority: String(row.source_authority ?? "unknown").trim() || "unknown",
    translation_status: String(row.translation_status ?? "source_language").trim() || "source_language",
    risk_tier: String(row.risk_tier ?? "medium").trim() || "medium",
    update_frequency: String(row.update_frequency ?? "event_based").trim() || "event_based",
    disclaimer_type: String(row.disclaimer_type ?? "check_official_source").trim() || "check_official_source",
    why_people_ask_ai: row.why_people_ask_ai ? String(row.why_people_ask_ai).trim() : null,
    why_ai_gets_wrong: row.why_ai_gets_wrong ? String(row.why_ai_gets_wrong).trim() : null,
    claims,
    source_hints: Array.isArray(row.source_hints) ? row.source_hints : [],
    generation_model: row.generation_model ? String(row.generation_model).trim() : "seed-topic-catalog",
  };
}
async function loadCatalogFile(file: string) {
  const raw = await readFile(path.join(TOPIC_CANDIDATE_DIR, file), "utf8");
  const rows = file.endsWith(".jsonl") ? raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as ImportRow) : [JSON.parse(raw) as ImportRow];
  return { file, rows: rows.filter((row) => required(row).length === 0) };
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "admin.import.catalog");
  if (adminError) return adminError;
  const files = (await readdir(TOPIC_CANDIDATE_DIR)).filter((file) => file.endsWith(".json") || file.endsWith(".jsonl")).sort();
  const catalog = await Promise.all(files.map(loadCatalogFile));
  return NextResponse.json({ files: catalog.map(({ file, rows }) => ({ file, count: rows.length, rows })) });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "admin.import");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json().catch(() => null) as { rows?: ImportRow[]; target?: ImportTarget } | null;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const target: ImportTarget = body?.target === "topic_candidates" ? "topic_candidates" : "canonical";
  if (rows.length === 0) return NextResponse.json({ error: "rows are required" }, { status: 400 });
  if (rows.length > 500) return NextResponse.json({ error: "maximum 500 rows per import" }, { status: 400 });

  const validation = rows.map((row, index) => ({ line: index + 1, missing: required(row), claims: Array.isArray(row.claims) ? row.claims.length : 0 }));
  const failed = validation.filter((v) => v.missing.length > 0);
  if (failed.length > 0) return NextResponse.json({ error: "validation failed", validation }, { status: 400 });

  if (target === "topic_candidates") {
    const candidates = rows.map(normalizeTopicCandidate);
    const { error } = await sb.from("topic_candidates").upsert(candidates, { onConflict: "slug" });
    if (error) return NextResponse.json({ error: "topic candidates import failed", detail: error.message }, { status: 500 });
    const claimCount = candidates.reduce((sum, row) => sum + row.claims.length, 0);
    await logAdminAuditEvent(sb, request, "admin.import.topic_candidates", { rows: rows.length, claims: claimCount });
    return NextResponse.json({ success: true, target, imported: rows.length, claims_created: claimCount, validation });
  }

  const normalized = rows.map(normalize);
  const { error: entityError } = await sb.from("entities").upsert(normalized.map((r) => r.entity), { onConflict: "id" });
  if (entityError) return NextResponse.json({ error: "entities import failed", detail: entityError.message }, { status: 500 });
  const { error: docError } = await sb.from("documents").upsert(normalized.map((r) => r.document), { onConflict: "id" });
  if (docError) return NextResponse.json({ error: "documents import failed", detail: docError.message }, { status: 500 });
  const { error: claimError } = await sb.from("claims").upsert(normalized.flatMap((r) => r.claims), { onConflict: "id" });
  if (claimError) return NextResponse.json({ error: "claims import failed", detail: claimError.message }, { status: 500 });
  await sb.from("listings").upsert(normalized.map((r) => r.listing), { onConflict: "id" });
  await logAdminAuditEvent(sb, request, "admin.import", { rows: rows.length, claims: normalized.flatMap((r) => r.claims).length });
  return NextResponse.json({ success: true, target, imported: rows.length, claims_created: normalized.flatMap((r) => r.claims).length, validation });
}
