import { getChangelogEvents } from "../../lib/changelog";
import { presentationForStatus } from "../../lib/citation-presentation";
import { documentPageUrl, siteUrl } from "../../lib/urls";
import { sanitizeXmlText, toRssDate } from "../../lib/xml";

// Verified-only RSS feed (Bible v7 Book IV section 9.2). Zero events is a valid,
// well-formed empty channel — never a 4xx/5xx.
export const revalidate = 600;

const FEED_TITLE = "For-Ai verified claims";
const FEED_DESCRIPTION =
  "Verified-only For-Ai claim-level registry feed. Multilingual items intentionally omit RSS <language> when a channel spans locales.";

export async function GET() {
  const events = await getChangelogEvents({ statuses: ["verified"], limit: 50 });
  const selfUrl = siteUrl("/feed.xml");
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
      <title>${sanitizeXmlText(event.title)}</title>
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
    <link>${sanitizeXmlText(siteUrl("/"))}</link>
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
