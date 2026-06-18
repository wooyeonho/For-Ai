import { NextResponse } from "next/server";
import { getSeedDocumentBySlug, renderSeedDocumentMarkdown } from "../../../lib/seed-data";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const fileName = path.join("/");

  if (!fileName.endsWith(".md")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const slug = fileName.slice(0, -3);
  const document = getSeedDocumentBySlug(slug);

  if (!document) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(renderSeedDocumentMarkdown(document), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
