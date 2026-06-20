import { NextResponse } from "next/server";
import { submitHallucinationReport } from "../../../../lib/submission-stubs";

function generateContributorHash(): string {
  return `anon-${Date.now().toString(36)}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { document_id, entity_id, ai_service, prompt, ai_answer, expected_correction } = body;

  if (!document_id || !ai_service || !ai_answer) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const report = submitHallucinationReport({
    document_id,
    entity_id: entity_id ?? "",
    ai_service,
    prompt: prompt ?? "",
    ai_answer,
    expected_correction: expected_correction ?? "",
    contributor_hash: generateContributorHash(),
  });

  return NextResponse.json({ success: true, report }, { status: 201 });
}
