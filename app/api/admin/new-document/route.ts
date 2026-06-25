import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

function stableId(prefix: string, slug: string): string {
  return `${prefix}-${slug}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
}

interface ClaimInput {
  field_path: string;
  claim_text?: string;
}

export async function POST(request: Request) {
  const adminError = requireAdmin(request, "document.create");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const entity_id = String(body.entity_id ?? "").trim();
  const slug = String(body.slug ?? "").trim();
  const lang = String(body.lang ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE;
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
        };
      }).filter((c) => c.field_path)
    : [];

  if (!entity_id || !slug || !title || !category) {
    return NextResponse.json({ error: "entity_id, slug, title, category are required" }, { status: 400 });
  }

  const { data: entity } = await sb.from("entities").select("id, country").eq("id", entity_id).maybeSingle();
  if (!entity) return NextResponse.json({ error: `entity "${entity_id}" not found` }, { status: 404 });

  const { data: existingDoc } = await sb.from("documents").select("id").eq("slug", slug).eq("lang", lang).maybeSingle();
  if (existingDoc) return NextResponse.json({ error: `document slug "${slug}" (${lang}) already exists` }, { status: 409 });

  const documentId = stableId("doc", `${slug}-${lang}`);
  const listingId = stableId("listing", `${slug}-${lang}`);

  const { error: docErr } = await sb.from("documents").insert({
    id: documentId,
    entity_id,
    slug,
    lang,
    country: String((entity as { country?: string }).country ?? ""),
    title,
    category,
    template,
    status: "ai_draft",
    confidence: "low",
    data: {},
  });
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  let claimsCreated = 0;
  if (claims.length > 0) {
    const claimRows = claims.map((cl, i) => ({
      id: stableId("claim", `${slug}-${i + 1}`),
      document_id: documentId,
      entity_id,
      field_path: cl.field_path,
      claim_text: cl.claim_text || cl.field_path,
      claim_value: "확인 필요",
      confidence: "low" as const,
      status: "needs_review" as const,
    }));
    const { error: claimsErr } = await sb.from("claims").insert(claimRows);
    if (claimsErr) {
      await sb.from("documents").delete().eq("id", documentId);
      return NextResponse.json({ error: claimsErr.message }, { status: 500 });
    }
    claimsCreated = claimRows.length;
  }

  await sb.from("listings").insert({
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
