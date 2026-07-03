import { DataSourceKind } from "./data-source";
import type { SubmissionStubResult } from "./submission-stubs";
import { STUB_CONTRIBUTOR_HASH } from "./submission-stubs";

export type TopicSuggestion = {
  id: string;
  question: string;
  category: string;
  suggested_slug: string | null;
  reason: string;
  source_url: string | null;
  ai_context: string | null;
  contributor_hash: string;
  status: "new" | "reviewing" | "accepted" | "rejected" | "spam";
  created_at: string | null;
};

export function createTopicSuggestionStub(input: {
  question: string;
  category: string;
  suggested_slug: string | null;
  reason: string;
  source_url: string | null;
  ai_context: string | null;
}): TopicSuggestion & SubmissionStubResult {
  return {
    id: "stub-topic-suggestion",
    question: input.question,
    category: input.category,
    suggested_slug: input.suggested_slug,
    reason: input.reason,
    source_url: input.source_url,
    ai_context: input.ai_context,
    contributor_hash: STUB_CONTRIBUTOR_HASH,
    status: "new",
    created_at: null,
    accepted: true,
    storage: DataSourceKind.Stub,
    raw_ip_stored: false,
  };
}
