import { persistentRateLimited } from './rate-limit-store';
import {
  HALLUCINATION_FIELD_MAX_LENGTHS,
  SUBMISSION_PER_DAY_LIMIT,
  SUBMISSION_PER_MINUTE_LIMIT,
  SUBMISSION_URL_MAX_COUNT,
} from './submission-constants';

// Server-only spam/rate-limit checks for the public submission endpoints
// (report, hallucination, suggest-topic). Limit *values* live solely in
// submission-constants so client forms can import them without pulling in
// this module's rate-limit-store dependency (which imports "server-only").

export type HallucinationFieldName = keyof typeof HALLUCINATION_FIELD_MAX_LENGTHS;
export type SubmissionStatus = 'new' | 'spam_suspected';

export type SpamCheckResult = {
  reject: boolean;
  status: SubmissionStatus;
  reasons: string[];
};

const URL_PATTERN = /https?:\/\/[^\s)]+|www\.[^\s)]+/gi;
const REPEATED_TOKEN_PATTERN = /\b([\p{L}\p{N}]{3,})\b(?:[\s\p{P}]+\1\b){4,}/iu;
const REPEATED_CHAR_PATTERN = /(.)\1{12,}/u;
const AD_PHRASES = [
  'buy now',
  'limited time',
  'free money',
  'guaranteed income',
  'work from home',
  'casino',
  'viagra',
  'loan offer',
  'crypto giveaway',
  '지금 구매',
  '무료 체험',
  '고수익 보장',
  '카지노',
  '대출 상담',
  '성인광고',
];

export function hasHoneypotValue(body: Record<string, unknown>): boolean {
  const honeypotFields = ['honeypot', 'hp', 'website', 'company_url', 'fax_number'];
  return honeypotFields.some((field) => String(body[field] ?? '').trim().length > 0);
}

export function countUrls(...values: Array<string | null | undefined>): number {
  return values.reduce((total, value) => total + (value?.match(URL_PATTERN)?.length ?? 0), 0);
}

export function hasRepeatedText(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 30) return false;
  return REPEATED_CHAR_PATTERN.test(normalized) || REPEATED_TOKEN_PATTERN.test(normalized);
}

export function hasAdvertisingLanguage(text: string): boolean {
  const normalized = text.toLocaleLowerCase();
  return AD_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function inspectSubmissionText(values: Array<string | null | undefined>): SpamCheckResult {
  const joined = values.filter(Boolean).join('\n');
  const reasons: string[] = [];

  if (countUrls(joined) > SUBMISSION_URL_MAX_COUNT) reasons.push('too_many_urls');
  if (hasRepeatedText(joined)) reasons.push('repeated_text');
  if (hasAdvertisingLanguage(joined)) reasons.push('advertising_language');

  return { reject: false, status: reasons.length > 0 ? 'spam_suspected' : 'new', reasons };
}

export async function contributorSubmissionRateLimited(contributorHash: string): Promise<'minute' | 'day' | null> {
  const key = contributorHash;

  // Persistent (cross-instance) limiter — a module-level Map here would reset
  // on every serverless cold start and be trivially bypassable.
  const minute = await persistentRateLimited('submission-minute', key, SUBMISSION_PER_MINUTE_LIMIT, 60_000);
  if (minute.limited) return 'minute';

  const day = await persistentRateLimited('submission-day', key, SUBMISSION_PER_DAY_LIMIT, 86_400_000);
  if (day.limited) return 'day';

  return null;
}
