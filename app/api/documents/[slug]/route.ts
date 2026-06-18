import { NextResponse } from "next/server";
import { getSeedDocumentBySlug } from "../../../../lib/seed-data";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = getSeedDocumentBySlug(slug);

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json(document);
}
