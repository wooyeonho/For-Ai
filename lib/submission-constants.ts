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
