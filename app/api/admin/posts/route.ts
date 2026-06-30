import { NextResponse } from "next/server";
import { adminErrorResponse, logAdminAuditEvent, requireAdmin, supabaseAdmin } from "@/lib/admin-api";

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "posts.list");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return adminErrorResponse("admin.posts.supabase_client", new Error("SUPABASE_SERVICE_ROLE_KEY not configured"), 500);

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
  if (error) return adminErrorResponse("admin.posts.list", error, 500);

  return NextResponse.json({ posts: data ?? [], count: data?.length ?? 0 });
}

export async function PATCH(request: Request) {
  const adminError = await requireAdmin(request, "posts.update");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return adminErrorResponse("admin.posts.supabase_client", new Error("SUPABASE_SERVICE_ROLE_KEY not configured"), 500);

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

  if (body.action) {
    const action = String(body.action);
    if (!["topic_candidate", "source_suggestion", "report"].includes(action)) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    const { data: post, error: postError } = await sb
      .from("community_posts")
      .select("id, document_id, claim_id, content, contributor_hash")
      .eq("id", id)
      .single();
    if (postError || !post) return NextResponse.json({ error: "post not found" }, { status: 404 });

    const { data: document } = post.document_id
      ? await sb.from("documents").select("id, entity_id, title, slug, lang, country, category").eq("id", post.document_id).maybeSingle()
      : { data: null };

    if (action === "topic_candidate") {
      const title = document?.title ? `${document.title} community follow-up` : `Community post ${post.id.slice(0, 8)}`;
      const slugBase = (document?.slug ?? `community-post-${post.id}`).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      const { error: conversionError } = await sb.from("topic_candidates").insert({
        source: "user_suggested",
        lang: document?.lang ?? "ko",
        country: document?.country ?? "global",
        title,
        slug: `${slugBase}-community-${Date.now()}`,
        category: document?.category ?? "community_intake",
        why_people_ask_ai: post.content,
        source_hints: [{ type: "community_post", post_id: post.id, document_id: post.document_id, claim_id: post.claim_id }],
        contributor_hash: post.contributor_hash,
      });
      if (conversionError) return NextResponse.json({ error: conversionError.message }, { status: 500 });
    }

    if (action === "source_suggestion") {
      const { error: conversionError } = await sb.from("source_candidates").insert({
        document_id: post.document_id,
        entity_id: document?.entity_id ?? null,
        claim_id: post.claim_id,
        title: `Community post ${post.id.slice(0, 8)}`,
        citation: post.content,
        message: "Converted from community post by admin.",
        contributor_hash: post.contributor_hash,
      });
      if (conversionError) return NextResponse.json({ error: conversionError.message }, { status: 500 });
    }

    if (action === "report") {
      if (!post.document_id && !document?.entity_id) {
        return NextResponse.json({ error: "report conversion requires a linked document" }, { status: 400 });
      }
      const { error: conversionError } = await sb.from("reports").insert({
        document_id: post.document_id,
        entity_id: document?.entity_id ?? null,
        report_type: "community_post",
        message: post.claim_id ? `[claim_id: ${post.claim_id}]\n${post.content}` : post.content,
        contributor_hash: post.contributor_hash,
      });
      if (conversionError) return NextResponse.json({ error: conversionError.message }, { status: 500 });
    }

    await logAdminAuditEvent(sb, request, "admin.posts.convert", { post_id: id, action });
  }

  const { error } = await sb.from("community_posts").update(updates).eq("id", id);
  if (error) return adminErrorResponse("admin.posts.update", error, 500, id);

  await logAdminAuditEvent(sb, request, "admin.posts.update", { post_id: id, ...updates });

  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "posts.create");
  if (adminError) return adminError;

  const sb = supabaseAdmin();
  if (!sb) return adminErrorResponse("admin.posts.supabase_client", new Error("SUPABASE_SERVICE_ROLE_KEY not configured"), 500);

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
    claim_id: body.claim_id ? String(body.claim_id).trim() : null,
    author_type: authorType,
    author_name: String(body.author_name ?? "관리자").trim().slice(0, 50),
    content,
    status: "published",
  }).select("id, created_at").single();

  if (error) return adminErrorResponse("admin.posts.create", error, 500);

  await logAdminAuditEvent(sb, request, "admin.posts.create", { post_id: data.id, author_type: authorType });

  return NextResponse.json({ success: true, id: data.id, created_at: data.created_at }, { status: 201 });
}
