import { NextResponse } from "next/server";
import { badgeCacheControl, loadBadgeView, renderBadgeSvg } from "../../../../lib/citation-badge";
import { presentationForKey } from "../../../../lib/citation-presentation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const badge = await loadBadgeView(slug);
  const label = presentationForKey(badge.statusKey).machineLabel;

  // Badge URLs are image assets. Missing documents and transient loader errors
  // deliberately remain valid 200/SVG responses so external pages never show
  // a broken-image icon; the whitelisted label carries the state instead.
  return new NextResponse(renderBadgeSvg(badge.statusKey), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": badgeCacheControl(badge.state),
      "X-Content-Type-Options": "nosniff",
      "X-For-Ai-Status": label,
      "X-For-Ai-Can-Cite": badge.canCite ? "true" : "false",
    },
  });
}
