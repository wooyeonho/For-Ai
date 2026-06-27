import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractIp, makeContributorHash } from "@/lib/contributor-hash";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: Request) {
  const sb = supabaseAnon();
  if (!sb) {
    const missing = [
      !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    return NextResponse.json({ error: "DB not configured", missing }, { status: 500 });
  }

  const url = new URL(request.url);
  const documentId = url.searchParams.get("document_id");
  const authorType = url.searchParams.get("author_type");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  let query = sb
    .from("community_posts")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (documentId) query = query.eq("document_id", documentId);
  if (authorType && ["user", "ai", "admin"].includes(authorType)) {
    query = query.eq("author_type", authorType);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ posts: data ?? [], count: data?.length ?? 0 });
}

export async function POST(request: Request) {
  const sb = supabaseAnon();
  if (!sb) {
    const missing = [
      !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    return NextResponse.json({ error: "DB not configured", missing }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const authorType = String(body.author_type ?? "user");
  if (!["user", "ai"].includes(authorType)) {
    return NextResponse.json({ error: "author_type must be 'user' or 'ai'" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content || content.length < 2) {
    return NextResponse.json({ error: "content is required (min 2 chars)" }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "content too long (max 2000 chars)" }, { status: 400 });
  }

  const authorName = String(body.author_name ?? (authorType === "ai" ? "AI" : "익명")).trim().slice(0, 50);
  const documentId = body.document_id ? String(body.document_id).trim() : null;

  const ip = extractIp(request);
  const contributorHash = makeContributorHash(ip);

  // Public submissions land as 'pending' and require admin approval in
  // /admin/posts before they become visible. Admin/AI posts created through the
  // service-role /api/admin/posts route publish directly.
  const { data, error } = await sb.from("community_posts").insert({
    document_id: documentId,
    author_type: authorType,
    author_name: authorName,
    content,
    contributor_hash: contributorHash,
    status: "pending",
  }).select("id, created_at").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    id: data.id,
    created_at: data.created_at,
    status: "pending",
    message: "검토 후 게시됩니다.",
  }, { status: 201 });
}
