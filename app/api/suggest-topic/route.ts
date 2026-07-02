import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { suggestTopicService } from "@/lib/services/suggest-topic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return NextResponse.json({ accepted: false, error: "DB not configured — submission was not stored" }, { status: 503 });
  }
  return suggestTopicService(createClient(SUPABASE_URL, SUPABASE_ANON), request, body);
}
