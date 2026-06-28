import type { ReportSubmission } from "./types";

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
