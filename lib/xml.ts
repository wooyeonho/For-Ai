// Shared XML helpers for the RSS feed and changelog feed (Task 4, bible v7 section 9).
// Kept dependency-free (no XML builder library) since output is small,
// hand-templated RSS 2.0 - correctness here is entirely about not emitting
// bytes that break XML 1.0 parsers.

// XML 1.0 forbids most C0 control characters (only tab/LF/CR are legal) and
// the non-characters U+FFFE/U+FFFF. Unicode surrogate code units (U+D800-
// U+DFFF) are only valid in JS strings as a matched high+low PAIR encoding
// an astral character (e.g. emoji) - stripping the whole range would corrupt
// legitimate multilingual claim text, so only *unpaired* surrogates are
// removed below.
const FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function stripUnpairedSurrogates(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
    const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;
    if (isHighSurrogate) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[i] + value[i + 1];
        i += 1;
        continue;
      }
      continue; // unpaired high surrogate: drop
    }
    if (isLowSurrogate) continue; // unpaired low surrogate: drop
    result += value[i];
  }
  return result;
}

export function sanitizeXmlText(value: unknown): string {
  const text = stripUnpairedSurrogates(String(value ?? "").replace(FORBIDDEN_CONTROLS, ""));
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Deliberately stricter than bare Date.parse(), which loosely accepts
// shapes like "2026" or "July 15 2026" that are not real timestamps. Also
// accepts a bare ISO calendar date (YYYY-MM-DD, no time) — that's the
// day-precision format claims/verification_events actually store their
// dates in throughout this codebase (e.g. last_verified_at), so requiring a
// time component here would reject essentially all real registry data.
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function isValidRfc3339Timestamp(value: string | null | undefined): value is string {
  if (!value || !RFC3339_PATTERN.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export function toRssDate(value: string): string {
  return new Date(value).toUTCString();
}

export type RssItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  description: string;
};

// Shared RSS 2.0 + Atom self-link envelope for feed.xml and changelog.xml -
// both need identical structure (self link, lastBuildDate, no <language>
// since channels are multilingual) and differ only in title/description/items.
export function buildRssDocument(options: {
  title: string;
  description: string;
  selfUrl: string;
  items: RssItem[];
}): string {
  const { title, description, selfUrl, items } = options;
  const lastBuildDate = new Date().toUTCString();
  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${sanitizeXmlText(item.title)}</title>
      <link>${sanitizeXmlText(item.link)}</link>
      <guid isPermaLink="false">${sanitizeXmlText(item.guid)}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description>${sanitizeXmlText(item.description)}</description>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${sanitizeXmlText(title)}</title>
    <link>${sanitizeXmlText(selfUrl)}</link>
    <atom:link href="${sanitizeXmlText(selfUrl)}" rel="self" type="application/rss+xml" />
    <description>${sanitizeXmlText(description)}</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;
}

// Cheap, dependency-free content fingerprint for an ETag - stable across
// requests that return the same items, changes whenever any item's id or
// timestamp changes. Not cryptographic; collision resistance isn't a
// requirement for a cache-validation header.
export function computeFeedEtag(items: RssItem[]): string {
  const basis = items.map((item) => `${item.guid}:${item.pubDate}`).join("|");
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (Math.imul(31, hash) + basis.charCodeAt(i)) | 0;
  }
  return `"${(hash >>> 0).toString(16)}"`;
}
