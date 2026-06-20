import type { ReportSubmission, HallucinationReport } from "./types";

/**
 * In-memory stub for correction report submissions.
 * Will be replaced with Supabase insert in a future goal.
 */
export function submitCorrectionReport(data: {
  document_id: string;
  entity_id: string;
  report_type: string;
  message: string;
  contributor_hash: string;
}): ReportSubmission {
  return {
    id: `report-${Date.now()}`,
    document_id: data.document_id,
    entity_id: data.entity_id,
    report_type: data.report_type,
    message: data.message,
    contributor_hash: data.contributor_hash,
    status: "new",
    created_at: new Date().toISOString(),
  };
}

/**
 * In-memory stub for AI hallucination report submissions.
 * Will be replaced with Supabase insert in a future goal.
 */
export function submitHallucinationReport(data: {
  document_id: string;
  entity_id: string;
  ai_service: string;
  prompt: string;
  ai_answer: string;
  expected_correction: string;
  contributor_hash: string;
}): HallucinationReport {
  return {
    id: `hallucination-${Date.now()}`,
    document_id: data.document_id,
    entity_id: data.entity_id,
    ai_service: data.ai_service,
    prompt: data.prompt,
    ai_answer: data.ai_answer,
    expected_correction: data.expected_correction,
    contributor_hash: data.contributor_hash,
    status: "new",
    created_at: new Date().toISOString(),
  };
}
