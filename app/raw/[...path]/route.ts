import { NextResponse } from "next/server";
import { getRegistryBundleBySlug } from "../../../lib/data";
import { renderDocumentMarkdown } from "../../../lib/render";
import { getRegistryBundleFromSupabase } from "../../../lib/supabase-documents";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const fileName = path.join("/");

  if (!fileName.endsWith(".md")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const slug = fileName.slice(0, -3);
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

  if (!bundle) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(renderDocumentMarkdown(bundle), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
