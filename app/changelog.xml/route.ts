import { getChangelogEvents } from "../../lib/changelog";
import { presentationForStatus } from "../../lib/citation-presentation";
import { documentPageUrl, siteUrl } from "../../lib/urls";
import { sanitizeXmlText, toRssDate } from "../../lib/xml";
import type { ClaimStatus } from "../../lib/types";

// Multi-status RSS changelog (Bible v7 Book IV section 9.3 discovery surface).
export const revalidate = 600;

const VALID_STATUSES = new Set<ClaimStatus>(["verified", "needs_review", "disputed", "unknown"]);
const FEED_TITLE = "For-Ai claim changelog";
const FEED_DESCRIPTION =
  "Multi-status claim-level verification changelog. LAG is computed across the full event stream before status filtering or pagination. Multilingual channel intentionally omits RSS <language>.";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.getAll("status").filter((s): s is ClaimStatus => VALID_STATUSES.has(s as ClaimStatus));
  const events = await getChangelogEvents({ statuses: requested.length ? requested : undefined, limit: 100 });
  const selfUrl = siteUrl("/changelog.xml");
  const lastBuildDate = toRssDate(new Date().toISOString());

  const items = events
    .map((event) => {
      const link = documentPageUrl(event.slug, event.lang);
      const newLabel = presentationForStatus(event.newStatus).machineLabel;
      const previousLabel = event.previousStatus ? presentationForStatus(event.previousStatus).machineLabel : null;
      const description = previousLabel
        ? `${previousLabel} → ${newLabel}${event.note ? ` · ${event.note}` : ""}`
        : `${newLabel}${event.note ? ` · ${event.note}` : ""}`;
      return `    <item>
      <title>${sanitizeXmlText(`${newLabel}: ${event.title} / ${event.fieldPath}`)}</title>
      <link>${sanitizeXmlText(link)}</link>
      <guid isPermaLink="false">${sanitizeXmlText(event.id)}</guid>
      <pubDate>${toRssDate(event.occurredAt)}</pubDate>
      <description>${sanitizeXmlText(description)}</description>
    </item>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${sanitizeXmlText(FEED_TITLE)}</title>
    <link>${sanitizeXmlText(siteUrl("/changelog"))}</link>
    <atom:link href="${sanitizeXmlText(selfUrl)}" rel="self" type="application/rss+xml" />
    <description>${sanitizeXmlText(FEED_DESCRIPTION)}</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
