import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCandidateEmbeddingText, buildConsensus, getCandidateSimilarityDecision } from "../lib/consensus";

type Cand = { slug: string; title: string; category: string; [key: string]: unknown };
const cand = (slug: string, title: string, category = "tax"): Cand => ({ slug, title, category });

function find(results: ReturnType<typeof buildConsensus>, slug: string) {
  const hit = results.find((r) => r.slug === slug);
  assert.ok(hit, `expected a consensus candidate with slug "${slug}"`);
  return hit;
}

test("multi-vendor agreement including a web-search provider reaches unanimous", () => {
  const shared = cand("shared-fact", "Shared Fact");
  const map = new Map<string, Cand[]>([
    ["perplexity", [shared]],
    ["gpt", [shared, cand("solo-openai", "Solo OpenAI", "x")]],
    ["gemini", [shared]],
  ]);

  const results = buildConsensus(map, 3);

  const agreed = find(results, "shared-fact");
  assert.equal(agreed.consensus_level, "unanimous");
  assert.equal(agreed.consensus_score, 1);
  assert.equal(agreed.agreed_providers.length, 3);

  // A candidate from a single provider stays "single".
  assert.equal(find(results, "solo-openai").consensus_level, "single");
});

test("single-vendor agreement (4 NVIDIA models) cannot exceed minority", () => {
  const nv = cand("nvidia-agree", "Nvidia Agree");
  const map = new Map<string, Cand[]>([
    ["nvidia", [nv]],
    ["nvidia_llama_70b", [nv]],
    ["nvidia_nemotron_70b", [nv]],
    ["nvidia_llama_8b", [nv]],
    ["gpt", [cand("gpt-solo", "Gpt Solo", "x")]],
  ]);

  const results = buildConsensus(map, 5);

  const nvidiaAgree = find(results, "nvidia-agree");
  assert.equal(nvidiaAgree.agreed_providers.length, 4);
  // Correlated same-vendor agreement is capped: even 4 models = minority only.
  assert.equal(nvidiaAgree.consensus_level, "minority");
  assert.ok(nvidiaAgree.consensus_score >= 0 && nvidiaAgree.consensus_score <= 1);
});

test("cross-vendor agreement without web search is downgraded one level", () => {
  const shared = cand("parametric-only", "Parametric Only");
  const map = new Map<string, Cand[]>([
    ["gpt", [shared]],
    ["gemini", [shared]],
  ]);

  const results = buildConsensus(map, 2);

  // Two distinct vendors fully agree (score 1.0 → would be unanimous), but with
  // no web-search-grounded provider it is downgraded to majority.
  const agreed = find(results, "parametric-only");
  assert.equal(agreed.consensus_level, "majority");
  assert.equal(agreed.consensus_score, 1);
});


test("candidate embedding text combines title, slug, category, and claim questions", () => {
  const text = buildCandidateEmbeddingText({
    title: "Passport Reissue Fee",
    slug: "passport-reissue-fee",
    category: "government",
    claims: [
      { question: "What is the fee?" },
      { question: "Which source confirms it?" },
    ],
  });

  assert.equal(text, "Passport Reissue Fee\npassport-reissue-fee\ngovernment\nWhat is the fee?\nWhich source confirms it?");
});

test("embedding-only similarity is a possible duplicate signal, not an auto-merge rule", () => {
  const a = cand("passport-reissue-fee", "Passport Reissue Fee", "government");
  const b = cand("renewal-cost-for-passports", "Renewal cost for passports", "government");

  const decision = getCandidateSimilarityDecision(a, b, { embeddingSimilarity: 0.91 });

  assert.equal(decision.matchedBy, "embedding");
  assert.equal(decision.isSimilar, false);
  assert.equal(decision.reviewSignal, "possible_duplicate");

  const map = new Map<string, Cand[]>([
    ["perplexity", [a]],
    ["gpt", [b]],
  ]);
  const results = buildConsensus(map, 2);

  assert.equal(results.length, 2);
});
