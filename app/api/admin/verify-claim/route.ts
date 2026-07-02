import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { listClaimsForReviewService, reviewClaimActionService } from "@/lib/services/admin-verify-claim";

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "claims.read_for_review");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  return listClaimsForReviewService(sb, request);
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "claims.review_action");
  if (adminError) return adminError;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  const body = await request.json();
  return reviewClaimActionService(sb, request, body);
}
