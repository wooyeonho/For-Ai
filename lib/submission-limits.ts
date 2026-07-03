import { persistentRateLimited } from './rate-limit-store';

export const REPORT_MESSAGE_MAX_LENGTH = 2000;
export const SUGGEST_TOPIC_MESSAGE_MAX_LENGTH = 2000;
export const SUBMISSION_URL_MAX_COUNT = 3;
export const SUBMISSION_PER_MINUTE_LIMIT = 3;
export const SUBMISSION_PER_DAY_LIMIT = 20;

export const HALLUCINATION_FIELD_MAX_LENGTHS = {
  ai_service: 100,
  prompt: 2000,
  ai_answer: 5000,
  expected_correction: 2000,
} as const;

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
