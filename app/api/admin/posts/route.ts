import { NextResponse } from "next/server";
import { logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "posts.list");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const authorType = url.searchParams.get("author_type");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);

  let query = sb
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);
  if (authorType && ["user", "ai", "admin"].includes(authorType)) {
    query = query.eq("author_type", authorType);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ posts: data ?? [], count: data?.length ?? 0 });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "posts.update");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status && ["pending", "published", "hidden", "spam", "deleted"].includes(String(body.status))) {
    updates.status = String(body.status);
  }
  if (typeof body.content === "string") {
    updates.content = String(body.content).trim();
  }

  const { error } = await sb.from("community_posts").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.posts.update", { post_id: id, ...updates });

  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "posts.create");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

  const authorType = String(body.author_type ?? "admin");
  if (!["user", "ai", "admin"].includes(authorType)) {
    return NextResponse.json({ error: "invalid author_type" }, { status: 400 });
  }

  const { data, error } = await sb.from("community_posts").insert({
    document_id: body.document_id ? String(body.document_id).trim() : null,
    author_type: authorType,
    author_name: String(body.author_name ?? "관리자").trim().slice(0, 50),
    content,
    status: "published",
  }).select("id, created_at").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAuditEvent(sb, request, "admin.posts.create", { post_id: data.id, author_type: authorType });

  return NextResponse.json({ success: true, id: data.id, created_at: data.created_at }, { status: 201 });
}
