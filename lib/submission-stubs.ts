import type { HallucinationReport, ReportSubmission } from "./types";

export type SubmissionStubResult = {
  accepted: true;
  status: "new";
  storage: "stub";
  raw_ip_stored: false;
  contributor_hash: string;
};

export const STUB_CONTRIBUTOR_HASH = "local-stub-contributor-hash";

export function createReportSubmissionStub(input: {
  document_id: string;
  entity_id: string;
  field_path: string | null;
  message: string;
}): ReportSubmission & SubmissionStubResult {
  return {
    id: "stub-report-submission",
    document_id: input.document_id,
    entity_id: input.entity_id,
    report_type: "correction",
    message: input.message,
    contributor_hash: STUB_CONTRIBUTOR_HASH,
    status: "new",
    created_at: null,
    accepted: true,
    storage: "stub",
    raw_ip_stored: false,
  };
}

export function createHallucinationReportStub(input: {
  document_id: string;
  entity_id: string;
  ai_service: string;
  prompt: string | null;
  ai_answer: string | null;
  expected_correction: string | null;
}): HallucinationReport & SubmissionStubResult {
  return {
    id: "stub-hallucination-report",
    document_id: input.document_id,
    entity_id: input.entity_id,
    ai_service: input.ai_service,
    prompt: input.prompt,
    ai_answer: input.ai_answer,
    expected_correction: input.expected_correction,
    contributor_hash: STUB_CONTRIBUTOR_HASH,
    status: "new",
    created_at: null,
    accepted: true,
    storage: "stub",
    raw_ip_stored: false,
  };
}

// Aliases used by API routes (Goals 8-9)
export function submitHallucinationReport(input: {
    document_id: string;
    entity_id: string;
    ai_service: string;
    prompt: string;
    ai_answer: string;
    expected_correction: string;
    contributor_hash: string;
}): HallucinationReport & SubmissionStubResult {
    return createHallucinationReportStub(input);
}

export function submitCorrectionReport(input: {
    document_id: string;
    entity_id: string;
    report_type: string;
    message: string;
    contributor_hash: string;
}): ReportSubmission & SubmissionStubResult {
    return createReportSubmissionStub({
          document_id: input.document_id,
          entity_id: input.entity_id,
          field_path: null,
          message: input.message,
    });
}
