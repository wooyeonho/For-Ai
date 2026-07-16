import type { Metadata } from "next";
import Link from "next/link";
import { CHANGELOG_STATUSES, getRecentClaimStatusEvents, isChangelogStatus, type ChangelogEvent, type ChangelogStatus } from "../../lib/changelog";
import { isValidLocale, getTranslations, DEFAULT_LOCALE, type SupportedLocale } from "../../lib/i18n";

// Bible v7 section 9.3 explicitly allows this simpler "accumulated limit"
// shape instead of full cursor-pagination UI, subject to: hard cap 300, URL
// parameter validation, no duplicate rows, and a note that cursor-based
// pagination (already implemented in getRecentClaimStatusEvents /
// /api/changelog) is the intended future migration path if this page ever
// needs to page past the cap.
const CHANGELOG_PAGE_LIMIT = 300;

export const metadata: Metadata = {
  title: "Claim changelog",
  description: "Claim-level verification status transitions (verified, needs_review, disputed) across the For-Ai registry.",
};

export const revalidate = 600;

function statusLabel(status: ChangelogStatus, locale: SupportedLocale): string {
  const t = getTranslations(locale).citation;
  if (status === "verified") return t.citationStatusVerified;
  if (status === "needs_review") return t.citationStatusNeedsReview;
  return t.citationStatusDisputed;
}

function utcDateKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10); // YYYY-MM-DD, already UTC (ISO 8601 with Z)
}

function groupByUtcDate(events: ChangelogEvent[]): Array<{ date: string; events: ChangelogEvent[] }> {
  const groups = new Map<string, ChangelogEvent[]>();
  for (const event of events) {
    const key = utcDateKey(event.occurred_at);
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  return Array.from(groups.entries()).map(([date, dayEvents]) => ({ date, events: dayEvents }));
}

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};

  const rawStatus = params.status;
  const requestedStatuses = (Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : []).filter(isChangelogStatus);

  const rawLang = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const locale: SupportedLocale = rawLang && isValidLocale(rawLang) ? rawLang : DEFAULT_LOCALE;

  const { events } = await getRecentClaimStatusEvents({
    statuses: requestedStatuses.length ? requestedStatuses : undefined,
    limit: CHANGELOG_PAGE_LIMIT,
  });
  const groups = groupByUtcDate(events);
  const langQuery = rawLang && isValidLocale(rawLang) ? `lang=${rawLang}` : "";
  const filterHref = (status?: ChangelogStatus) => {
    const query = [status ? `status=${status}` : "", langQuery].filter(Boolean).join("&");
    return query ? `/changelog?${query}` : "/changelog";
  };

  return (
    <main className="page-shell">
      <section className="registry-panel">
        <p className="eyebrow">Discovery metadata</p>
        <h1>Claim changelog</h1>
        <p>Every row is a claim-level verification transition. Previous status is computed across the complete event history before any status filter or pagination is applied.</p>
        <p>
          <Link href="/changelog.xml">RSS changelog</Link>
          {" · "}
          <Link href="/feed.xml">Verified-only RSS</Link>
          {" · "}
          <Link href="/api/changelog">JSON API</Link>
        </p>
      </section>

      <section className="registry-panel">
        <h2>Filter</h2>
        <p>
          <a href={filterHref()} style={{ marginInlineEnd: 12, fontWeight: requestedStatuses.length === 0 ? "bold" : "normal" }}>
            All
          </a>
          {CHANGELOG_STATUSES.map((status) => (
            <a
              key={status}
              href={filterHref(status)}
              style={{ marginInlineEnd: 12, fontWeight: requestedStatuses.includes(status) ? "bold" : "normal" }}
            >
              {statusLabel(status, locale)}
            </a>
          ))}
        </p>
      </section>

      <section className="registry-panel">
        <h2>Events</h2>
        {groups.length === 0 ? (
          <p>No changelog events available.</p>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              <h3>{group.date}</h3>
              <ol>
                {group.events.map((event) => (
                  <li key={event.id}>
                    <strong>{statusLabel(event.status, locale)}</strong>{" "}
                    <Link href={`/${event.lang}/wiki/${event.document_slug}`}>{event.document_title}</Link>{" "}
                    <code>{event.field_path}</code>
                    <br />
                    <small>
                      {event.occurred_at} &middot; {event.previous_status ?? "none"} &rarr; {event.status}
                    </small>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
