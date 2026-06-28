import { NextResponse } from "next/server";
import { getRegistryBundleBySlug } from "../../../../lib/data";
import { getRegistryBundleFromSupabase } from "../../../../lib/supabase-documents";
import { renderDocumentJson } from "../../../../lib/render";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = getRegistryBundleBySlug(slug) ?? await getRegistryBundleFromSupabase(slug);

  if (!bundle) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const rendered = renderDocumentJson(bundle);
  return NextResponse.json(rendered, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=3600",
      "X-For-Ai-Can-Cite": rendered.citation_guidance.can_cite ? "true" : "false",
    },
  });
}
