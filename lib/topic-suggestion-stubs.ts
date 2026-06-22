export type TopicSuggestionStubInput = {
  title: string;
  type: string;
  why_people_ask_ai: string;
  why_ai_gets_wrong: string;
  suggested_claims: string;
  source_urls: string;
};

export type TopicSuggestionStubResult = {
  accepted: true;
  storage: "stub";
  status: "new";
  contributor_hash: null;
  title: string;
  type: string;
  suggested_claims: string[];
  source_urls: string[];
  note: string;
};

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createTopicSuggestionStub(input: TopicSuggestionStubInput): TopicSuggestionStubResult {
  return {
    accepted: true,
    storage: "stub",
    status: "new",
    contributor_hash: null,
    title: input.title,
    type: input.type,
    suggested_claims: splitLines(input.suggested_claims),
    source_urls: splitLines(input.source_urls),
    note:
      "Topic suggestion accepted as a non-persistent stub. Generated or submitted claims remain 확인 필요 / low / needs_review until source-backed verification.",
  };
}
