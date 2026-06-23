import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";

const prompts = {
  "lazycodex:master": "ai-ops/lazycodex/master-plan.txt",
  "lazycodex:p0": "ai-ops/lazycodex/p0-stabilization.txt",
  "lazycodex:ai-readiness": "ai-ops/lazycodex/ai-readiness.txt",
  "lazycodex:four-hour": "ai-ops/lazycodex/four-hour-stabilization.txt",
  "claude:product-review": "ai-ops/claude/product-review.txt",
  "claude:source-trust": "ai-ops/claude/source-trust-policy.txt",
  "devin:final-cleanup": "ai-ops/devin/final-cleanup.txt",
};

const key = process.argv[2];

if (!key || !prompts[key]) {
  console.log("Available prompts:");
  for (const promptKey of Object.keys(prompts)) {
    console.log(`- ${promptKey}`);
  }
  process.exit(key ? 1 : 0);
}

const path = normalize(prompts[key]);
process.stdout.write(readFileSync(join(process.cwd(), path), "utf8"));
