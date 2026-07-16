import { getRecentClaimStatusEvents, changelogEventUrl } from "../../lib/changelog";
import { siteUrl } from "../../lib/urls";
import { buildRssDocument, computeFeedEtag, toRssDate, type RssItem } from "../../lib/xml";

// Bible v7 section 9.3: verified/needs_review/disputed transitions (the full
// changelog, not the verified-only feed.xml), same RSS envelope conventions.
export const revalidate = 600;

export async function GET() {
  const { events } = await getRecentClaimStatusEvents({
    statuses: ["verified", "needs_review", "disputed"],
    limit: 100,
  });

  const items: RssItem[] = events.map((event) => ({
    title: `${event.document_title}: ${event.field_path} -> ${event.status}`,
    link: changelogEventUrl(event),
    guid: event.id,
    pubDate: toRssDate(event.occurred_at),
    description: `${event.previous_status ?? "none"} -> ${event.status} (${event.document_title}, ${event.field_path})`,
  }));

  const body = buildRssDocument({
    title: "For-Ai claim changelog",
    description: "Claim-level verification status transitions (verified, needs_review, disputed). Previous status is computed across the full event history before any status filter.",
    selfUrl: siteUrl("/changelog.xml"),
    items,
  });

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=600",
      etag: computeFeedEtag(items),
      "last-modified": items[0] ? toRssDate(events[0].occurred_at) : new Date().toUTCString(),
    },
  });
}
