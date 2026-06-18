import { NextResponse } from "next/server";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { renderDocumentJson } from "../../../../lib/render";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug);

  if (!bundle) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json(renderDocumentJson(bundle));
}
