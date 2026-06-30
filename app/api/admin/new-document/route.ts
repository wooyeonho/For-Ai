import { NextResponse } from "next/server";
import { adminErrorResponse, logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

function stableId(prefix: string, slug: string): string {
  return `${prefix}-${slug}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
}

interface ClaimInput {
  field_path: string;
  claim_text?: string;
  claim_value?: string;
  placeholder_value?: string;
  jurisdiction?: string;
  required_source_type?: string;
  source_hint?: string;
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "document.create");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return adminErrorResponse("admin.document.supabase_client", new Error("SUPABASE_SERVICE_ROLE_KEY not configured"), 500);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const entity_id = String(body.entity_id ?? "").trim();
  const slug = String(body.slug ?? "").trim();
  const lang = String(body.lang ?? "").trim();
  const country = String(body.country ?? "").trim().toUpperCase();
  const jurisdiction = String(body.jurisdiction ?? country).trim().toUpperCase() || country;
  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "").trim();
  const template = String(body.template ?? "fact-sheet").trim() || "fact-sheet";
  const claims: ClaimInput[] = Array.isArray(body.claims)
    ? (body.claims as unknown[]).map((c) => {
        if (typeof c === "string") return { field_path: c.trim(), claim_text: c.trim() };
        const obj = c as Record<string, unknown>;
        return {
          field_path: String(obj.field_path ?? "").trim(),
          claim_text: String(obj.claim_text ?? obj.field_path ?? "").trim(),
          claim_value: String(obj.claim_value ?? obj.placeholder_value ?? "").trim(),
          placeholder_value: String(obj.placeholder_value ?? obj.claim_value ?? "").trim(),
          jurisdiction: String(obj.jurisdiction ?? "").trim().toUpperCase(),
          required_source_type: String(obj.required_source_type ?? "").trim(),
          source_hint: String(obj.source_hint ?? "").trim(),
        };
      }).filter((c) => c.field_path)
    : [];

  if (!entity_id || !slug || !lang || !country || !title || !category) {
    return NextResponse.json({ error: "entity_id, slug, lang, country, title, category are required" }, { status: 400 });
  }

  const { data: entity, error: entityErr } = await sb.from("entities").select("id, country").eq("id", entity_id).maybeSingle();
  if (entityErr) return adminErrorResponse("admin.document.check_entity", entityErr, 500, entity_id);
  if (!entity) return NextResponse.json({ error: `entity "${entity_id}" not found` }, { status: 404 });

  const { data: existingDoc, error: existingDocErr } = await sb.from("documents").select("id").eq("slug", slug).eq("lang", lang).eq("country", country).maybeSingle();
  if (existingDocErr) return adminErrorResponse("admin.document.check_existing", existingDocErr, 500, slug);
  if (existingDoc) return NextResponse.json({ error: `document slug "${slug}" (${lang}) already exists` }, { status: 409 });

  const documentId = stableId("doc", `${slug}-${lang}`);
  const listingId = stableId("listing", `${slug}-${lang}`);

  const { error: docErr } = await sb.from("documents").insert({
    id: documentId,
    entity_id,
    slug,
    lang,
    country,
    title,
    category,
    template,
    status: "ai_draft",
    confidence: "low",
    data: {
      admin_draft_payload: {
        version: "admin-document-draft-v1",
        claims: claims.map((cl) => ({
          field_path: cl.field_path,
          claim_text: cl.claim_text || cl.field_path,
          placeholder_value: cl.placeholder_value || cl.claim_value || "확인 필요",
          jurisdiction: cl.jurisdiction || jurisdiction,
          required_source_type: cl.required_source_type || null,
          source_hint: cl.source_hint || null,
        })),
      },
    },
  });
  if (docErr) return adminErrorResponse("admin.document.create", docErr, 500, documentId);

  let claimsCreated = 0;
  if (claims.length > 0) {
    const claimRows = claims.map((cl, i) => ({
      id: stableId("claim", `${slug}-${i + 1}`),
      document_id: documentId,
      entity_id,
      field_path: cl.field_path,
      claim_text: cl.claim_text || cl.field_path,
      claim_value: cl.claim_value || cl.placeholder_value || "확인 필요",
      jurisdiction: cl.jurisdiction || jurisdiction,
      confidence: "low" as const,
      status: "needs_review" as const,
    }));
    const { error: claimsErr } = await sb.from("claims").insert(claimRows);
    if (claimsErr) {
      await sb.from("documents").delete().eq("id", documentId);
      return adminErrorResponse("admin.document.claims_create", claimsErr, 500, documentId);
    }
    claimsCreated = claimRows.length;
  }

  const { error: listingErr } = await sb.from("listings").insert({
    id: listingId,
    entity_id,
    document_id: documentId,
    lang,
    slug,
    title,
    summary: claimsCreated > 0 ? `${claimsCreated}개 claim 확인 필요` : null,
    status: "ai_draft",
    confidence: "low",
  });
  if (listingErr) {
    if (claimsCreated > 0) {
      await sb.from("claims").delete().eq("document_id", documentId);
    }
    await sb.from("documents").delete().eq("id", documentId);
    return adminErrorResponse("admin.document.listing_create", listingErr, 500, listingId);
  }

  await logAdminAuditEvent(sb, request, "admin.document.create", {
    entity_id,
    document_id: documentId,
    slug,
    claims_created: claimsCreated,
  });

  return NextResponse.json({
    success: true,
    document_id: documentId,
    slug,
    claims_created: claimsCreated,
    url: `/${lang}/wiki/${slug}`,
  });
}
