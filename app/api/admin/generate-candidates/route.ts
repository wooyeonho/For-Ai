import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/admin-api";
import { generateCandidatesService, getGenerateCandidatesMetadataService } from "@/lib/services/admin-generate-candidates";

function jsonFromResult(result: Awaited<ReturnType<typeof generateCandidatesService>> | ReturnType<typeof getGenerateCandidatesMetadataService>) {
  if (result.ok) return NextResponse.json(result.data, { status: result.status ?? 200 });
  return NextResponse.json({ error: result.error, ...(result.detail ? { detail: result.detail } : {}) }, { status: result.status });
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request, "candidates.generate");
  if (adminError) return adminError;
  const body = await request.json();
  return jsonFromResult(await generateCandidatesService(supabaseAdmin(), request, body));
}

export async function GET(request: Request) {
  const adminError = await requireAdmin(request, "candidates.generate_metadata");
  if (adminError) return adminError;
  return jsonFromResult(getGenerateCandidatesMetadataService());
}
