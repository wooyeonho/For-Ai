import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, getTranslations, isValidLocale } from "../../../lib/i18n";
import type { SupportedLocale } from "../../../lib/i18n";
import { getChangelogEvents, nextChangelogCursor, type ChangelogCursor } from "../../../lib/changelog";
import { presentationForStatus } from "../../../lib/citation-presentation";
import { siteUrl } from "../../../lib/urls";

export const revalidate = 600;

type ChangelogParams = { locale: string };
type ChangelogSearchParams = { cursor?: string };

const PAGE_SIZE = 50;

function decodeCursor(raw: string | undefined): ChangelogCursor | undefined {
  if (!raw) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      decoded && typeof decoded === "object" &&
      typeof decoded.occurredAt === "string" && typeof decoded.eventId === "string" &&
      Number.isFinite(Date.parse(decoded.occurredAt))
    ) {
      return { occurredAt: decoded.occurredAt, eventId: decoded.eventId };
    }
  } catch {
    // Malformed cursor: fall back to the first page rather than erroring.
  }
  return undefined;
}

function encodeCursor(cursor: ChangelogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function utcDateKey(occurredAt: string): string {
  return new Date(occurredAt).toISOString().slice(0, 10);
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<ChangelogParams> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isValidLocale(locale)) return { title: getTranslations("en").changelog.metadataTitle };
  const t = getTranslations(locale as SupportedLocale);
  return {
    title: t.changelog.metadataTitle,
    description: t.changelog.metadataDescription,
    alternates: {
      languages: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `/${l}/changelog`])),
      types: { "application/rss+xml": siteUrl("/changelog.xml") },
    },
  };
}

export default async function ChangelogPage({
  params,
  searchParams,
}: {
  params: Promise<ChangelogParams>;
  searchParams: Promise<ChangelogSearchParams>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  const t = getTranslations(locale as SupportedLocale);

  const { cursor: rawCursor } = await searchParams;
  const cursor = decodeCursor(rawCursor);
  const events = await getChangelogEvents({
    statuses: ["verified", "needs_review", "disputed"],
    limit: PAGE_SIZE,
    cursor,
  });
  const next = events.length === PAGE_SIZE ? nextChangelogCursor(events) : null;

  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const key = utcDateKey(event.occurredAt);
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  return (
    <article>
      <header className="registry-panel">
        <p className="eyebrow">{t.changelog.eyebrow}</p>
        <h1>{t.changelog.title}</h1>
        <p>{t.changelog.description}</p>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{t.changelog.utcNote}</p>
        <nav aria-label={t.changelog.eyebrow} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/changelog.xml">{t.changelog.rssLink}</Link>
          <Link href="/feed.xml">{t.changelog.verifiedRssLink}</Link>
          <Link href="/api/changelog">{t.changelog.jsonApiLink}</Link>
        </nav>
      </header>

      <section className="registry-panel" aria-labelledby="changelog-events">
        <h2 id="changelog-events">{t.changelog.eventsHeading}</h2>
        {events.length === 0 ? (
          <p className="stat-note">{t.changelog.noEvents}</p>
        ) : (
          [...groups.entries()].map(([day, dayEvents]) => (
            <section key={day} aria-labelledby={`changelog-day-${day}`}>
              <h3 id={`changelog-day-${day}`}>{day} (UTC)</h3>
              <ol className="registry-index">
                {dayEvents.map((event) => {
                  const newPresentation = presentationForStatus(event.newStatus);
                  const previousPresentation = event.previousStatus ? presentationForStatus(event.previousStatus) : null;
                  return (
                    <li key={event.id} className="registry-row">
                      <div className="registry-row-main">
                        <strong className="registry-row-title">
                          <Link href={`/${event.lang}/wiki/${event.slug}`}>{event.title}</Link>
                        </strong>
                        <span className="registry-row-entity">
                          {t.changelog.fieldLabel}: <code>{event.fieldPath}</code>
                        </span>
                        <span className="meta-label">
                          {previousPresentation ? `${previousPresentation.machineLabel} → ` : ""}
                          {newPresentation.machineLabel}
                          {event.note ? ` · ${event.note}` : ""}
                        </span>
                      </div>
                      <div className="registry-row-meta">
                        <span
                          className="badge"
                          style={{ color: newPresentation.color, borderColor: newPresentation.color }}
                        >
                          {newPresentation.machineLabel}
                        </span>
                        <time dateTime={event.occurredAt} className="meta-label">
                          {new Date(event.occurredAt).toISOString()}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
        {next ? (
          <nav aria-label={t.changelog.loadMore}>
            <Link className="btn btn-secondary" href={`/${locale}/changelog?cursor=${encodeURIComponent(encodeCursor(next))}`}>
              {t.changelog.loadMore}
            </Link>
          </nav>
        ) : null}
      </section>
    </article>
  );
}
