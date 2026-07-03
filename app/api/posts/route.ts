import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { makeContributorHashForRequest } from "@/lib/contributor-hash";
import { clientIp } from "@/lib/rate-limit";
import { persistentRateLimited } from "@/lib/rate-limit-store";

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
  const claimId = url.searchParams.get("claim_id");
  const authorType = url.searchParams.get("author_type");
  const questionType = url.searchParams.get("question_type");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  let query = sb
    .from("community_posts")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (documentId) query = query.eq("document_id", documentId);
  if (claimId) query = query.eq("claim_id", claimId);
  if (authorType && ["user", "ai", "admin"].includes(authorType)) {
    query = query.eq("author_type", authorType);
  } else if (!includeAi) {
    query = query.neq("author_type", "ai");
  }
  if (questionType && ["question", "discussion", "report"].includes(questionType)) {
    query = query.eq("question_type", questionType);
  }
  if (questionType && ["question", "discussion", "report"].includes(questionType)) {
    query = query.eq("question_type", questionType);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ posts: data ?? [], count: data?.length ?? 0 });
}

export async function POST(request: Request) {
  // Block DB spam-loading: cap anonymous post submissions per IP. Public posts
  // land as 'pending' and require moderation, but unbounded inserts are a DDoS /
  // storage-abuse vector, so throttle before touching the database.
  if ((await persistentRateLimited("community-posts", clientIp(request), 10, 60 * 60 * 1000)).limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

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
  if (authorType !== "user") {
    return NextResponse.json({ error: "public submissions must use author_type='user'; AI suggestions require the admin/internal route" }, { status: 400 });
  }

  const content = String(body.content ?? "").trim();
  if (!content || content.length < 2) {
    return NextResponse.json({ error: "content is required (min 2 chars)" }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "content too long (max 2000 chars)" }, { status: 400 });
  }

  const authorName = String(body.author_name ?? "익명").trim().slice(0, 50);
  const documentId = body.document_id ? String(body.document_id).trim() : null;
  const claimId = body.claim_id ? String(body.claim_id).trim() : null;
  const rawQuestionType = body.question_type ? String(body.question_type).trim() : null;
  const questionType = rawQuestionType && ["question", "discussion", "report"].includes(rawQuestionType) ? rawQuestionType : null;

  if (claimId) {
    const { data: claim, error: claimError } = await sb
      .from("claims")
      .select("id, document_id")
      .eq("id", claimId)
      .maybeSingle();
    if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
    if (!claim) return NextResponse.json({ error: "claim_id not found" }, { status: 400 });
    if (documentId && claim.document_id !== documentId) {
      return NextResponse.json({ error: "claim_id does not belong to document_id" }, { status: 400 });
    }
  }

  let contributorHash: string;
  try {
    contributorHash = makeContributorHashForRequest(request);
  } catch (error) {
    console.error('[posts] Contributor salt missing:', error);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Public submissions land as 'pending' user posts and require admin approval in
  // /admin/posts before they become visible. AI posts are reserved for the
  // service-role /api/admin/posts route or internal generation flows.
  const { data, error } = await sb.from("community_posts").insert({
    document_id: documentId,
    claim_id: claimId,
    author_type: authorType,
    author_name: authorName,
    content,
    contributor_hash: contributorHash,
    status: "pending",
    ...(questionType ? { question_type: questionType } : {}),
  }).select("id, created_at").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    id: data.id,
    created_at: data.created_at,
    status: "pending",
    message: "검토 후 게시됩니다.",
    contributor_hash: contributorHash,
    receipt_url: `/contribute/receipt/${contributorHash}`,
    raw_ip_stored: false,
  }, { status: 201 });
}
