export const REPORT_MESSAGE_MAX_LENGTH = 2000;

export const HALLUCINATION_FIELD_MAX_LENGTHS = {
  ai_service: 100,
  prompt: 2000,
  ai_answer: 5000,
  expected_correction: 2000,
} as const;

export type HallucinationFieldName = keyof typeof HALLUCINATION_FIELD_MAX_LENGTHS;
