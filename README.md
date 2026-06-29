# For-Ai

For-Ai is a global claim-level fact registry that AI, search engines, and humans can cite from the same sources.

## Schema source of truth

`schema-v3.sql` is the source of truth for the database model and closed factual/status values. TypeScript union types in `lib/types.ts` must mirror the enums and check-constrained values defined by `schema-v3.sql`; they must not introduce schema-only alternatives or omit schema values.

Run `npm run ci:guards` before merging changes. The CI guard includes `scripts/check-schema-types.mjs`, which compares priority schema values such as claim status, confidence level, source type, and verification event type against the TypeScript unions.
