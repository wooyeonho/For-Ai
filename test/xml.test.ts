import assert from "node:assert/strict";
import test from "node:test";
import { isValidRfc3339Timestamp, sanitizeXmlText, toRssDate } from "../lib/xml";

test("sanitizeXmlText removes XML 1.0 invalid controls and escapes markup", () => {
  assert.equal(sanitizeXmlText("A &B<C>\"\'"), "A &amp;B&lt;C&gt;&quot;&apos;");
});

test("sanitizeXmlText strips lone (unpaired) surrogates but preserves valid surrogate pairs", () => {
  const emoji = "\u{1F600}"; // a valid astral character made of a high+low surrogate pair
  assert.equal(sanitizeXmlText(`before ${emoji} after`), `before ${emoji} after`);

  const unpairedHigh = "\uD800";
  const unpairedLow = "\uDC00";
  assert.equal(sanitizeXmlText(`x${unpairedHigh}y`), "xy");
  assert.equal(sanitizeXmlText(`x${unpairedLow}y`), "xy");
});

test("sanitizeXmlText removes the U+FFFE/U+FFFF non-characters", () => {
  const raw = "a" + "\uFFFE" + "b" + "\uFFFF" + "c";
  assert.equal(sanitizeXmlText(raw), "abc");
});

test("sanitizeXmlText keeps tab/newline/carriage-return, which XML 1.0 allows", () => {
  assert.equal(sanitizeXmlText("a\tb\nc\rd"), "a\tb\nc\rd");
});

test("isValidRfc3339Timestamp excludes invalid and null timestamps, includes valid ones", () => {
  assert.equal(isValidRfc3339Timestamp("not-a-date"), false);
  assert.equal(isValidRfc3339Timestamp(null), false);
  assert.equal(isValidRfc3339Timestamp(undefined), false);
  assert.equal(isValidRfc3339Timestamp(""), false);
  assert.equal(isValidRfc3339Timestamp("2026-07-15T00:00:00.000Z"), true);
});

test("toRssDate renders RFC 822 format required by RSS 2.0", () => {
  const rendered = toRssDate("2026-07-15T00:00:00.000Z");
  assert.match(rendered, /^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
});
