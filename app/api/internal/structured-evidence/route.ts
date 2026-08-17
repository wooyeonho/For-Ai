import { NextRequest, NextResponse } from "next/server";
import { createEnvReviewedTranslationProvider } from "@/lib/i18n/reviewed-translation-provider";
import { createStructuredEvidenceRoute } from "@/lib/i18n/structured-evidence-route";

const handleEvidence = createStructuredEvidenceRoute(createEnvReviewedTranslationProvider());

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "non_production_only" }, { status: 404 });
  }

  const locale = request.nextUrl.searchParams.get("locale")?.trim() ?? "";
  const messageKey = request.nextUrl.searchParams.get("messageKey")?.trim() ?? "";
  if (!locale || !messageKey) {
    return NextResponse.json({ error: "missing_query" }, { status: 400 });
  }

  const result = await handleEvidence(locale, messageKey);
  return NextResponse.json(result.body, { status: result.status });
}
