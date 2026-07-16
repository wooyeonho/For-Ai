import { getRecentClaimStatusEvents, changelogEventUrl } from "../../lib/changelog";
import { siteUrl } from "../../lib/urls";
import { buildRssDocument, computeFeedEtag, toRssDate, type RssItem } from "../../lib/xml";

// Bible v7 section 9.2: verified-only transition feed, latest 50, no <language>
// tag (channel spans every supported locale).
export const revalidate = 600;

export async function GET() {
  const { events } = await getRecentClaimStatusEvents({ statuses: ["verified"], limit: 50 });

  const items: RssItem[] = events.map((event) => ({
    title: `${event.document_title}: ${event.field_path} verified`,
    link: changelogEventUrl(event),
    guid: event.id,
    pubDate: toRssDate(event.occurred_at),
    description: `${event.document_title} (${event.field_path}) transitioned to verified.`,
  }));

  const body = buildRssDocument({
    title: "For-Ai verified claims",
    description: "Verified-only claim-level transitions across the For-Ai registry. Multilingual feed — items are not filtered by language.",
    selfUrl: siteUrl("/feed.xml"),
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
