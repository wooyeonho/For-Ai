// XML 1.0 safety helpers shared by /feed.xml and /changelog.xml.

// XML 1.0 forbids most C0 controls (tab/LF/CR are allowed) and the two
// non-characters U+FFFE/U+FFFF. Lone (unpaired) surrogates are also invalid
// in a well-formed XML/Unicode text node, but a valid low surrogate
// immediately preceded by a valid high surrogate is a legitimate character
// (emoji, rare CJK extension ideographs) and must be preserved, so pairing
// is handled separately by stripUnpairedSurrogates rather than by a blanket
// surrogate-range strip.
const XML_INVALID_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const HIGH_SURROGATE = /[\uD800-\uDBFF]/;
const LOW_SURROGATE = /[\uDC00-\uDFFF]/;

function stripUnpairedSurrogates(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (HIGH_SURROGATE.test(ch)) {
      const next = value[i + 1];
      if (next && LOW_SURROGATE.test(next)) {
        result += ch + next;
        i++;
        continue;
      }
      // Unpaired high surrogate: drop it.
      continue;
    }
    if (LOW_SURROGATE.test(ch)) {
      // Unpaired low surrogate (no preceding high surrogate consumed it above): drop it.
      continue;
    }
    result += ch;
  }
  return result;
}

export function sanitizeXmlText(value: unknown): string {
  const text = stripUnpairedSurrogates(String(value ?? "").replace(XML_INVALID_CONTROLS, ""));
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function isValidRfc3339Timestamp(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

// RFC 822 date format required by RSS 2.0's <pubDate>/<lastBuildDate>.
export function toRssDate(value: string): string {
  return new Date(value).toUTCString();
}
