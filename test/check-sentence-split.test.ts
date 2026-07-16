import assert from "node:assert/strict";
import test from "node:test";
import { splitSentences, exceedsMaxSentences, dedupeSentences } from "../lib/check/sentence-split";
import { SUPPORTED_LOCALES } from "../lib/i18n/locales";

test("splits sentences for all 7 supported locales without throwing", () => {
  const samplesByLocale: Record<string, string> = {
    ko: "서울 지하철 기본요금은 1400원이다. 교통카드를 사용하면 할인된다.",
    en: "The base fare is 1400 won. It applies to adults with a transit card.",
    hi: "मेट्रो का किराया 1400 वॉन है। यह वयस्कों के लिए है।",
    ar: "أجرة المترو الأساسية هي 1400 وون. تنطبق على البالغين.",
    es: "La tarifa base es de 1400 wones. Se aplica a los adultos.",
    ja: "基本料金は1400ウォンです。成人に適用されます。",
    zh: "基本票价是1400韩元。适用于成人。",
  };

  for (const locale of SUPPORTED_LOCALES) {
    const result = splitSentences(samplesByLocale[locale], locale);
    assert.ok(result.analyzable.length >= 1, `expected at least one analyzable sentence for ${locale}`);
  }
});

test("Arabic and Hindi punctuation (؟ and ।) are recognized as sentence terminators by the fallback splitter", () => {
  const arabic = "ما هي رسوم جواز السفر؟ رسوم جواز السفر هي خمسون ألف وون بالضبط في مكتب المقاطعة اليوم.";
  const hindi = "पासपोर्ट शुल्क क्या है? पासपोर्ट पुनः जारी करने का शुल्क जिला कार्यालय में पचास हजार वॉन है।";

  const arabicResult = splitSentences(arabic, "ar");
  const hindiResult = splitSentences(hindi, "hi");

  assert.ok(arabicResult.totalCandidates >= 2, "Arabic text should split into at least 2 sentences");
  assert.ok(hindiResult.totalCandidates >= 2, "Hindi text should split into at least 2 sentences");
});

test("newline is treated as a sentence boundary even with no terminal punctuation", () => {
  const text = "First point about the passport fee schedule\nSecond point about the district office hours";
  const result = splitSentences(text, "en");
  assert.equal(result.totalCandidates, 2);
  assert.equal(result.analyzable.length, 2);
});

test("CJK locales use an 8-character minimum; default locales use 15", () => {
  const shortJa = splitSentences("料金は無料。", "ja"); // 6 chars, below the 8-char CJK minimum
  assert.equal(shortJa.analyzable.length, 0);

  const longEnoughJa = splitSentences("この基本料金は千四百ウォンです。", "ja"); // >= 8 chars
  assert.equal(longEnoughJa.analyzable.length, 1);

  const shortEn = splitSentences("It is free.", "en"); // 11 chars, below the 15-char default minimum
  assert.equal(shortEn.analyzable.length, 0);

  const longEnoughEn = splitSentences("The base fare is 1400 won.", "en"); // >= 15 chars
  assert.equal(longEnoughEn.analyzable.length, 1);
});

test("exceedsMaxSentences is measured against the analyzable count, not raw candidates", () => {
  const manyShortLines = Array.from({ length: 60 }, () => "hi").join("\n"); // all below min length
  const result = splitSentences(manyShortLines, "en");
  assert.equal(result.analyzable.length, 0);
  assert.equal(exceedsMaxSentences(result), false);

  const manyLongLines = Array.from({ length: 51 }, (_, i) => `This is a sufficiently long sentence number ${i}.`).join("\n");
  const longResult = splitSentences(manyLongLines, "en");
  assert.equal(longResult.analyzable.length, 51);
  assert.equal(exceedsMaxSentences(longResult), true);
});

test("dedupeSentences collapses case/whitespace-normalized duplicates while preserving order", () => {
  const input = ["The base fare is 1400 won.", "THE BASE FARE IS 1400 WON.", "A different sentence entirely here."];
  const result = dedupeSentences(input);
  assert.deepEqual(result, ["The base fare is 1400 won.", "A different sentence entirely here."]);
});

test("locale defaults to en behavior for an invalid locale string instead of throwing", () => {
  const result = splitSentences("This is a reasonably long sentence for testing.", "not-a-locale");
  assert.ok(result.analyzable.length >= 1);
});
