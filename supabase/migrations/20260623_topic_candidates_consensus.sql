-- Add consensus columns to topic_candidates for cross-verification scoring.
-- These columns track how many AI providers agreed on each candidate.

ALTER TABLE topic_candidates
  ADD COLUMN IF NOT EXISTS consensus_score  numeric(3,2),
  ADD COLUMN IF NOT EXISTS consensus_level  text CHECK (consensus_level IN ('unanimous','majority','minority','single')),
  ADD COLUMN IF NOT EXISTS agreed_providers text[];
