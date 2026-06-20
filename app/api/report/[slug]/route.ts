import { NextResponse } from "next/server";
import { submitCorrectionReport } from "../../../../lib/submission-stubs";

function generateContributorHash(): string {
  return `anon-${Date.now().toString(36)}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { document_id, entity_id, report_type, message } = body;

  if (!document_id || !report_type || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const report = submitCorrectionReport({
    document_id,
    entity_id: entity_id ?? "",
    report_type,
    message,
    contributor_hash: generateContributorHash(),
  });

  return NextResponse.json({ success: true, report }, { status: 201 });
}
