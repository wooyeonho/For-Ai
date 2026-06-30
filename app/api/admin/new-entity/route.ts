import { NextResponse } from "next/server";
import { adminErrorResponse, logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "entity.create");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return adminErrorResponse("admin.entity.supabase_client", new Error("SUPABASE_SERVICE_ROLE_KEY not configured"), 500);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const type = String(body.type ?? "").trim();
  const canonical_name = String(body.canonical_name ?? "").trim();
  const country = String(body.country ?? "").trim();
  const region = String(body.region ?? "").trim() || null;
  const city = String(body.city ?? "").trim() || null;

  if (!id || !type || !canonical_name || !country) {
    return NextResponse.json({ error: "id, type, canonical_name, country are required" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await sb.from("entities").select("id").eq("id", id).maybeSingle();
  if (existingError) return adminErrorResponse("admin.entity.check_existing", existingError, 500, id);
  if (existing) return NextResponse.json({ error: `entity "${id}" already exists` }, { status: 409 });

  const { error } = await sb.from("entities").insert({ id, type, canonical_name, country, region, city });
  if (error) return adminErrorResponse("admin.entity.create", error, 500, id);

  await logAdminAuditEvent(sb, request, "admin.entity.create", { entity_id: id });
  return NextResponse.json({ success: true, entity_id: id });
}
