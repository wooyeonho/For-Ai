// Task 5-B1 — canonical text extractor for a fetched HTML page: strips
// markup/boilerplate down to a single normalized text block used for (a)
// content hashing and (b) quote offset/hash verification (lib/quote-verification.ts).
//
// Pure/no I/O: hand-rolled regex-based extraction rather than a DOM/parser
// dependency, consistent with the project's minimal-dependency footprint
// (Bible v7 Book I section 4, 50-year technical independence).

import { createHash } from "node:crypto";

// Tags whose entire subtree is boilerplate/non-content and must be dropped
// along with their contents (not just unwrapped).
const STRIPPED_TAGS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "select",
  "textarea",
];

// Tags whose closing boundary should become a line break so text either
// side of them doesn't fuse into one word/sentence.
const BLOCK_CLOSE_RE = /<\/(p|div|section|article|li|h[1-6]|tr|table|blockquote|pre|ul|ol|dl|dd|dt)\b[^>]*>/gi;
const LINE_BREAK_RE = /<br\s*\/?>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  copy: "©",
};

function stripTagsAndContent(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    out = out.replace(re, " ");
    // Also drop a stray self-closing/void form (e.g. malformed <iframe/>).
    const voidRe = new RegExp(`<${tag}\\b[^>]*\\/>`, "gi");
    out = out.replace(voidRe, " ");
  }
  return out;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

export function extractCanonicalText(html: string): string {
  let text = stripTagsAndContent(html, STRIPPED_TAGS);
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(BLOCK_CLOSE_RE, "\n");
  text = text.replace(LINE_BREAK_RE, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text.replace(/[ \t\f\v]+/g, " ");
  text = text.replace(/[ \t]*\n[ \t]*/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function hashCanonicalText(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}
