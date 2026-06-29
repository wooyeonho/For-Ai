import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

type ImportClaim = { field_path?: string; claim_text?: string; question?: string; claim_value?: string; confidence?: string; status?: string };
type ImportRow = { entity_id?: string; id?: string; type?: string; name?: string; canonical_name?: string; slug?: string; lang?: string; country?: string; jurisdiction?: string; title?: string; category?: string; template?: string; claims?: ImportClaim[] };

function stableId(prefix: string, value: string): string { return `${prefix}-${value}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120); }
function required(row: ImportRow): string[] { return ["entity_id", "type", "slug", "title", "category", "country"].filter((key) => !String(row[key as keyof ImportRow] ?? "").trim()); }
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
    claims: claims.map((claim, claimIndex) => ({ id: stableId("claim", `${slug}-${index + 1}-${claimIndex + 1}`), document_id: documentId, entity_id: entityId, field_path: String(claim.field_path ?? `claim.${claimIndex + 1}`).trim(), claim_text: String(claim.claim_text ?? claim.question ?? claim.field_path ?? "확인 필요").trim(), claim_value: "확인 필요", jurisdiction, confidence: "low", status: "needs_review" })),
    listing: { id: stableId("listing", `${slug}-${lang}`), entity_id: entityId, document_id: documentId, lang, slug, title: String(row.title ?? row.name ?? "").trim(), summary: "Import candidate: 확인 필요", status: "needs_review", confidence: "low" },
  };
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "admin.import");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json().catch(() => null) as { rows?: ImportRow[] } | null;
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "rows are required" }, { status: 400 });
  if (rows.length > 500) return NextResponse.json({ error: "maximum 500 rows per import" }, { status: 400 });

  const validation = rows.map((row, index) => ({ line: index + 1, missing: required(row), claims: Array.isArray(row.claims) ? row.claims.length : 0 }));
  const failed = validation.filter((v) => v.missing.length > 0);
  if (failed.length > 0) return NextResponse.json({ error: "validation failed", validation }, { status: 400 });

  const normalized = rows.map(normalize);
  const { error: entityError } = await sb.from("entities").upsert(normalized.map((r) => r.entity), { onConflict: "id" });
  if (entityError) return NextResponse.json({ error: "entities import failed", detail: entityError.message }, { status: 500 });
  const { error: docError } = await sb.from("documents").upsert(normalized.map((r) => r.document), { onConflict: "id" });
  if (docError) return NextResponse.json({ error: "documents import failed", detail: docError.message }, { status: 500 });
  const { error: claimError } = await sb.from("claims").upsert(normalized.flatMap((r) => r.claims), { onConflict: "id" });
  if (claimError) return NextResponse.json({ error: "claims import failed", detail: claimError.message }, { status: 500 });
  await sb.from("listings").upsert(normalized.map((r) => r.listing), { onConflict: "id" });
  await logAdminAuditEvent(sb, request, "admin.import", { rows: rows.length, claims: normalized.flatMap((r) => r.claims).length });
  return NextResponse.json({ success: true, imported: rows.length, claims_created: normalized.flatMap((r) => r.claims).length, validation });
}
