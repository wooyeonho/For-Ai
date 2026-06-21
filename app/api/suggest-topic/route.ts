import { NextResponse } from "next/server";
import { createTopicSuggestionStub } from "../../../lib/topic-suggestion-stubs";

export async function POST(request: Request) {
  const body = await request.json();

  const question = String(body.question ?? "").trim();
  const category = String(body.category ?? "").trim();
  const suggestedSlug = String(body.suggested_slug ?? "").trim() || null;
  const reason = String(body.reason ?? "").trim();
  const sourceUrl = String(body.source_url ?? "").trim() || null;
  const aiContext = String(body.ai_context ?? "").trim() || null;

  if (!question || !category || !reason) {
    return NextResponse.json(
      { error: "question, category, and reason are required" },
      { status: 400 },
    );
  }

  const result = createTopicSuggestionStub({
    question,
    category,
    suggested_slug: suggestedSlug,
    reason,
    source_url: sourceUrl,
    ai_context: aiContext,
  });

  return NextResponse.json(
    {
      accepted: result.accepted,
      status: result.status,
      storage: result.storage,
      raw_ip_stored: result.raw_ip_stored,
    },
    { status: 200 },
  );
}
