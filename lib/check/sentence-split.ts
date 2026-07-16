import { isValidLocale, type SupportedLocale } from "../i18n/locales";
import { CHECK_LIMITS } from "./types";

// CJK scripts don't use inter-word spaces, so a much shorter run of
// characters can still be a complete, analyzable sentence.
const CJK_LOCALES = new Set<SupportedLocale>(["ja", "zh"]);
const CJK_MIN_CHARS = 8;
const DEFAULT_MIN_CHARS = 15;

// Fallback punctuation set covers ASCII + CJK + Arabic + Devanagari sentence
// terminators, used only when Intl.Segmenter is unavailable.
const FALLBACK_SPLIT_PATTERN = /(?<=[.!?。？！؟।॥])\s+/;

function isAnalyzable(sentence: string, locale: SupportedLocale): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) return false;
  const minChars = CJK_LOCALES.has(locale) ? CJK_MIN_CHARS : DEFAULT_MIN_CHARS;
  return trimmed.length >= minChars;
}

function segmentWithIntl(text: string, locale: SupportedLocale): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  const segments: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const trimmed = segment.trim();
    if (trimmed) segments.push(trimmed);
  }
  return segments;
}

function segmentWithFallback(text: string): string[] {
  return text
    .split(FALLBACK_SPLIT_PATTERN)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SentenceSplitResult = {
  analyzable: string[];
  totalCandidates: number;
};

// Splits free text into sentences for a supported locale. Every newline-
// delimited line is split independently first, since a line break is always
// a sentence boundary regardless of trailing punctuation (e.g. a bullet list
// with no periods). Each line is then segmented via Intl.Segmenter when
// available, falling back to punctuation-based splitting.
//
// "analyzable" sentences are those passing isAnalyzable() (the CJK/default
// minimum-length gate); MAX_SENTENCES (CHECK_LIMITS.maxAnalyzableSentences)
// is enforced against this analyzable count, not the raw candidate count, so
// short filler lines (e.g. blank bullet separators) don't consume the cap.
export function splitSentences(text: string, locale: string): SentenceSplitResult {
  const validLocale: SupportedLocale = isValidLocale(locale) ? locale : "en";
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());

  const allCandidates: string[] = [];
  for (const line of lines) {
    const segments = typeof Intl !== "undefined" && "Segmenter" in Intl
      ? segmentWithIntl(line, validLocale)
      : segmentWithFallback(line);
    allCandidates.push(...segments);
  }

  const analyzable = allCandidates.filter((sentence) => isAnalyzable(sentence, validLocale));
  return { analyzable, totalCandidates: allCandidates.length };
}

export function exceedsMaxSentences(result: SentenceSplitResult): boolean {
  return result.analyzable.length > CHECK_LIMITS.maxAnalyzableSentences;
}

// Dedupes by normalized (lowercased, whitespace-collapsed) text so the same
// sentence repeated verbatim isn't searched/scored twice, while preserving
// first-occurrence order and the original (non-normalized) sentence text.
export function dedupeSentences(sentences: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(sentence);
  }
  return result;
}
