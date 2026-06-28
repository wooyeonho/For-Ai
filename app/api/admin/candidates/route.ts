import { NextResponse } from "next/server";

import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { DEFAULT_LOCALE, LOCALE_CONFIG, isValidLocale } from "@/lib/i18n/locales";

function defaultCountryForLang(lang: string): string {
  return isValidLocale(lang) ? LOCALE_CONFIG[lang].country : "global";
}

export async function GET(request: Request) {
  const adminError = requireAdmin(request, "candidates.read");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "new";
  const sourceHints = searchParams.get("source_hints") ?? "all";
  let query = sb.from("topic_candidates").select("*").order("created_at", { ascending: false }).limit(100);
  if (status !== "all") query = query.eq("status", status);
  if (sourceHints === "with") query = query.not("source_hints", "eq", "[]").not("source_hints", "is", null);
  if (sourceHints === "without") query = query.or("source_hints.eq.[],source_hints.is.null");
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.candidates.list", {
    status,
    result_count: data?.length ?? 0,
  });
  return NextResponse.json({ candidates: data ?? [] });
}

export async function POST(request: Request) {
  const adminError = requireAdmin(request, "candidates.bulk_import");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const rows = Array.isArray(body.candidates) ? body.candidates : [];
  if (rows.length === 0) return NextResponse.json({ error: "candidates array is required" }, { status: 400 });
  if (rows.length > 100) return NextResponse.json({ error: "max 100 candidates per import" }, { status: 400 });

  const insertRows = (rows as Record<string, unknown>[]).map((r) => ({
    title: String(r.title ?? "").trim(),
    slug: String(r.slug ?? "").trim(),
    category: String(r.category ?? "").trim(),
    lang: String(r.lang ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE,
    country: String(r.country ?? "").trim() || defaultCountryForLang(String(r.lang ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE),
    source: "admin_created",
    status: "new",
    subcategory: r.subcategory ? String(r.subcategory) : null,
    risk_tier: r.risk_tier ? String(r.risk_tier) : "medium",
    why_people_ask_ai: r.why_people_ask_ai ? String(r.why_people_ask_ai) : null,
    why_ai_gets_wrong: r.why_ai_gets_wrong ? String(r.why_ai_gets_wrong) : null,
    claims: Array.isArray(r.claims) ? r.claims : [],
    source_hints: Array.isArray(r.source_hints) ? r.source_hints : [],
  }));

  for (const row of insertRows) {
    if (!row.title || !row.slug || !row.category) {
      return NextResponse.json({
        error: `missing required fields (title, slug, category) in row: ${row.slug || row.title || "(unknown)"}`,
      }, { status: 400 });
    }
  }

  const { error, data } = await sb.from("topic_candidates").insert(insertRows).select("id, slug");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.candidates.bulk_import", {
    imported_count: data?.length ?? 0,
  });
  return NextResponse.json({ success: true, imported: data?.length ?? 0, candidates: data });
}

export async function PATCH(request: Request) {
  const adminError = requireAdmin(request, "candidates.update");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const body = await request.json();
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();
  const allowed = new Set(["new", "reviewing", "approved", "rejected", "promoted", "spam"]);
  if (!id || !allowed.has(status)) return NextResponse.json({ error: "valid id and status are required" }, { status: 400 });

  const { data, error } = await sb
    .from("topic_candidates")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAdminAuditEvent(sb, request, "admin.candidates.update_status", {
    candidate_id: id,
    status,
  });
  return NextResponse.json({ candidate: data });
}
