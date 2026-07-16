import type { SupportedLocale } from "../i18n/locales";
import type { ContradictionGate, Quantity, QuantityUnit } from "./types";

// Locales where word-Jaccard alone under-counts real overlap: ja/zh have no
// inter-word spacing at all, and ko is agglutinative (particles attach
// directly to word stems with no space — "주민센터" vs "주민센터에서" share
// zero whitespace-delimited tokens despite being the same word), so all
// three fall back to character-bigram similarity as well.
const BIGRAM_FALLBACK_LOCALES = new Set<SupportedLocale>(["ja", "zh", "ko"]);

// Matches runs of Unicode letters or numbers; strips everything else
// (punctuation, symbols, whitespace) as token separators.
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

export function tokenizeForCheck(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_PATTERN) ?? []).filter((token) => token.length > 0);
}

function charBigrams(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const bigrams: string[] = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    bigrams.push(normalized.slice(i, i + 2));
  }
  return bigrams;
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Candidate ranking signal only — not the eligibility gate by itself (see
// lib/check/candidates.ts, which also requires the contradiction gate to
// pass). CJK locales have no inter-word spacing, so a pure word-Jaccard
// under-counts overlap; taking the max with character-bigram Jaccard gives a
// usable signal for ja/zh without needing a real CJK tokenizer.
export type TokenizedText = { tokens: string[]; bigrams: string[] };

// Precomputes both signals once per text so repeated comparisons (e.g. one
// sentence scored against every candidate in the registry) don't re-run
// tokenization/bigram extraction on the same string over and over — see
// lib/check/candidates.ts, which precomputes this once per candidate at
// index-build time and once per sentence per request.
export function tokenizeForSimilarity(text: string): TokenizedText {
  return { tokens: tokenizeForCheck(text), bigrams: charBigrams(text) };
}

export function claimSimilarityTokenized(a: TokenizedText, b: TokenizedText, locale: SupportedLocale): number {
  const wordSimilarity = jaccard(a.tokens, b.tokens);
  if (!BIGRAM_FALLBACK_LOCALES.has(locale)) return wordSimilarity;
  const bigramSimilarity = jaccard(a.bigrams, b.bigrams);
  return Math.max(wordSimilarity, bigramSimilarity);
}

export function claimSimilarity(sentence: string, candidateText: string, locale: SupportedLocale): number {
  return claimSimilarityTokenized(tokenizeForSimilarity(sentence), tokenizeForSimilarity(candidateText), locale);
}

// --- Quantity extraction -----------------------------------------------

// Unicode decimal digit blocks (ASCII, Arabic-Indic, Extended Arabic-Indic,
// Devanagari) normalized to ASCII 0-9 so numeric comparison works across
// scripts without a locale-specific number parser.
const DIGIT_BLOCKS: Array<[number, number]> = [
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic (Persian)
  [0x0966, 0x096f], // Devanagari
];

function normalizeDigits(text: string): string {
  let result = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x30 && code <= 0x39) {
      result += char;
      continue;
    }
    const block = DIGIT_BLOCKS.find(([start, end]) => code >= start && code <= end);
    result += block ? String(code - block[0]) : char;
  }
  return result;
}

const PERCENT_MARKERS = ["%", "٪", "percent", "percentage", "퍼센트"];
const CURRENCY_SYMBOLS = ["$", "€", "£", "¥", "₩", "₹"];
const CURRENCY_CODES = ["usd", "eur", "gbp", "jpy", "krw", "inr", "cny"];
const YEAR_WORD_MARKERS = ["year", "년", "年", "año", "sana", "साल", "वर्ष", "سنة"];
const PEOPLE_MARKERS = ["people", "명", "人", "personas", "लोग", "أشخاص"];

// index is the match's actual position in `context` (from the regex match
// that found numberText), not re-derived via indexOf — indexOf would always
// resolve to the FIRST occurrence of a repeated digit string, misclassifying
// every later occurrence using the wrong neighboring words.
function classifyUnit(numberText: string, context: string, index: number): QuantityUnit {
  const lowerContext = context.toLowerCase();
  const nearbyWindow = lowerContext.slice(Math.max(0, index - 12), index + numberText.length + 12);

  if (PERCENT_MARKERS.some((marker) => nearbyWindow.includes(marker))) return "percent";
  if (CURRENCY_SYMBOLS.some((symbol) => nearbyWindow.includes(symbol)) || CURRENCY_CODES.some((code) => nearbyWindow.includes(code))) return "currency";
  if (YEAR_WORD_MARKERS.some((word) => nearbyWindow.includes(word))) return "year";
  if (PEOPLE_MARKERS.some((word) => nearbyWindow.includes(word))) return "people";

  // Unmarked 4-digit numbers in the 1900-2099 range are almost always a
  // calendar year in this kind of text; narrower than the full 1000-2200
  // 4-digit range so it doesn't swallow ordinary amounts that happen to be
  // 4 digits (e.g. a 1400 won transit fare).
  const asNumber = Number(normalizeDigits(numberText));
  if (Number.isFinite(asNumber) && asNumber >= 1900 && asNumber <= 2099 && numberText.length === 4) return "year";

  return "count";
}

// The grouping segment is `*` (not `?`) so multi-group numbers like
// "14,000,000" match as a single token instead of splitting into "14,000"
// and a bogus trailing "000".
const NUMBER_PATTERN = /[0-9٠-٩۰-۹०-९]+(?:[.,][0-9٠-٩۰-۹०-९]+)*/gu;

export function extractQuantities(text: string, locale?: SupportedLocale): Quantity[] {
  const quantities: Quantity[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const digits = normalizeDigits(raw);
    // Spanish convention reverses ASCII/most-locale usage: '.' groups
    // thousands and ',' is the decimal separator (e.g. "1,5%" means 1.5%,
    // not 15%).
    const normalizedValue =
      locale === "es" ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
    const unit = classifyUnit(raw, text, index);
    quantities.push({ normalizedValue, unit });
  }
  return quantities;
}

function quantitiesConflict(a: Quantity[], b: Quantity[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  // Only compare quantities that share a classified unit; an unmatched unit
  // pairing (e.g. a year in one sentence, a percent in the other) is not
  // evidence of contradiction, just a different quantity being discussed.
  for (const qa of a) {
    for (const qb of b) {
      if (qa.unit !== qb.unit) continue;
      if (qa.normalizedValue !== qb.normalizedValue) return true;
    }
  }
  return false;
}

// --- Negation / polarity heuristics -------------------------------------

const NEGATION_MARKERS: Record<SupportedLocale, string[]> = {
  ko: ["아니", "않", "없", "못하", "불가"],
  en: [" not ", " no ", " never ", " cannot ", " can't ", " without ", "n't ", "n’t "],
  hi: ["नहीं", "मत"],
  ar: ["لا ", "ليس", "لم ", "لن "],
  es: [" no ", " nunca ", " sin "],
  ja: ["ない", "ません", "無い"],
  zh: ["不", "没有", "无"],
};

function hasNegation(text: string, locale: SupportedLocale): boolean {
  const padded = ` ${text.toLowerCase()} `;
  return NEGATION_MARKERS[locale].some((marker) => padded.includes(marker));
}

const INCREASE_MARKERS: Record<SupportedLocale, string[]> = {
  ko: ["증가", "인상", "상승", "늘어"],
  en: ["increase", "rise", "rose", "raised", "higher", "more than", "up from"],
  hi: ["वृद्धि", "बढ़"],
  ar: ["زيادة", "ارتفاع"],
  es: ["aumento", "incremento", "subida"],
  ja: ["増加", "上昇", "引き上げ"],
  zh: ["增加", "上升", "提高"],
};

const DECREASE_MARKERS: Record<SupportedLocale, string[]> = {
  ko: ["감소", "인하", "하락", "줄어"],
  en: ["decrease", "decline", "fell", "lowered", "lower", "less than", "down from"],
  hi: ["कमी", "घट"],
  ar: ["انخفاض", "تراجع"],
  es: ["disminución", "reducción", "baja"],
  ja: ["減少", "下降", "引き下げ"],
  zh: ["减少", "下降", "降低"],
};

function polarityDirection(text: string, locale: SupportedLocale): "increase" | "decrease" | null {
  const lower = text.toLowerCase();
  const hasIncrease = INCREASE_MARKERS[locale].some((marker) => lower.includes(marker));
  const hasDecrease = DECREASE_MARKERS[locale].some((marker) => lower.includes(marker));
  if (hasIncrease && !hasDecrease) return "increase";
  if (hasDecrease && !hasIncrease) return "decrease";
  return null;
}

// Heuristic contradiction gate — not a semantic entailment check. Order
// matters only for which single reason is reported; a sentence could trip
// more than one gate at once.
export function detectContradictionReasons(sentence: string, candidateText: string, locale: SupportedLocale): ContradictionGate {
  if (hasNegation(sentence, locale) !== hasNegation(candidateText, locale)) {
    return "negation_mismatch";
  }

  const sentenceQuantities = extractQuantities(sentence, locale);
  const candidateQuantities = extractQuantities(candidateText, locale);
  if (quantitiesConflict(sentenceQuantities, candidateQuantities)) {
    return "quantity_mismatch";
  }

  const sentenceDirection = polarityDirection(sentence, locale);
  const candidateDirection = polarityDirection(candidateText, locale);
  if (sentenceDirection && candidateDirection && sentenceDirection !== candidateDirection) {
    return "polarity_mismatch";
  }

  return "none";
}
