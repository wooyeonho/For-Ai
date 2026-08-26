-- YENO Living OS — 0005_functional_self.sql
-- G6 Functional Self, PREP_ONLY.
--
-- Functional only: durable memory, a versioned identity kernel with a hard
-- constitution, explicit desires, traceable goal selection and an internal
-- council. No claim of consciousness, emotion or life is made or storable —
-- `trg_self_no_consciousness_claim` refuses such a self-model answer.
--
-- Promotion is deliberately withheld: G6 stays PENDING with reason PREP_ONLY
-- until G5 provider access is resolved. Implementation completeness is not gate
-- acceptance.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- constitution
-- Hard rules cannot be satisfied by an Owner approval; they bound every goal.
CREATE TABLE constitution_rules (
  rule_id    TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  hard       INTEGER NOT NULL CHECK (hard IN (0, 1)),
  source_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE identity_kernel (
  version           INTEGER PRIMARY KEY,
  self_statement    TEXT NOT NULL,
  constitution_hash TEXT NOT NULL,
  traits            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  active            INTEGER NOT NULL CHECK (active IN (0, 1)),
  superseded_by     INTEGER REFERENCES identity_kernel(version),
  evidence_ref      TEXT
) STRICT;

CREATE UNIQUE INDEX idx_identity_active ON identity_kernel (active) WHERE active = 1;

-- -------------------------------------------------------------------- memory
-- Every memory row carries provenance, confidence and supersession so recall is
-- explainable and never silently rewritten.
CREATE TABLE memory_items (
  memory_id     TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN (
                  'EPISODIC','SEMANTIC','PROCEDURAL','OWNER','DECISION','EVIDENCE')),
  content       TEXT NOT NULL,
  source_ref    TEXT NOT NULL,
  confidence    REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  salience      INTEGER NOT NULL DEFAULT 0 CHECK (salience BETWEEN 0 AND 100),
  observed_at   TEXT NOT NULL,
  recorded_at   TEXT NOT NULL,
  superseded_by TEXT REFERENCES memory_items(memory_id)
) STRICT;

CREATE INDEX idx_memory_recall ON memory_items (kind, superseded_by, salience DESC);

-- A superseded memory stays readable as history but can never come back.
CREATE TRIGGER trg_memory_supersession_final
BEFORE UPDATE ON memory_items
WHEN OLD.superseded_by IS NOT NULL AND NEW.superseded_by IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a superseded memory cannot be reactivated');
END;

CREATE TRIGGER trg_memory_no_delete
BEFORE DELETE ON memory_items
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: memory is append-only; supersede instead of deleting');
END;

-- ------------------------------------------------------------------- desires
-- Desires are explicit rows, not prompt text: each activation is traceable to a
-- trigger and feeds goal selection.
CREATE TABLE desires (
  desire_id      TEXT PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  description    TEXT NOT NULL,
  baseline_weight REAL NOT NULL CHECK (baseline_weight >= 0.0 AND baseline_weight <= 1.0),
  enabled        INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  created_at     TEXT NOT NULL
) STRICT;

CREATE TABLE desire_activations (
  activation_id TEXT PRIMARY KEY,
  desire_id     TEXT NOT NULL REFERENCES desires(desire_id),
  activation    REAL NOT NULL CHECK (activation >= 0.0 AND activation <= 1.0),
  trigger_kind  TEXT NOT NULL CHECK (trigger_kind IN ('MEMORY','SIGNAL','OWNER','HOMEOSTASIS','SCHEDULE')),
  trigger_ref   TEXT NOT NULL,
  ts            TEXT NOT NULL
) STRICT;

CREATE INDEX idx_desire_activations ON desire_activations (desire_id, ts DESC);

-- Internal state that makes "want" measurable rather than asserted. Every metric
-- is "lower is better" with target 0, so deviation beyond tolerance is pressure.
CREATE TABLE homeostasis (
  metric     TEXT PRIMARY KEY,
  value      REAL NOT NULL,
  target     REAL NOT NULL,
  tolerance  REAL NOT NULL CHECK (tolerance > 0.0),
  updated_at TEXT NOT NULL
) STRICT;

-- --------------------------------------------------------------------- goals
CREATE TABLE goals (
  goal_id       TEXT PRIMARY KEY,
  statement     TEXT NOT NULL,
  rationale     TEXT NOT NULL,
  desire_id     TEXT NOT NULL REFERENCES desires(desire_id),
  activation_id TEXT NOT NULL REFERENCES desire_activations(activation_id),
  priority_raw  INTEGER NOT NULL CHECK (priority_raw BETWEEN -40 AND 100),
  state         TEXT NOT NULL CHECK (state IN ('PROPOSED','SELECTED','REJECTED','DONE','ABANDONED')),
  created_at    TEXT NOT NULL,
  decided_at    TEXT,
  verdict_id    TEXT,
  evidence_ref  TEXT
) STRICT;

CREATE INDEX idx_goals_state ON goals (state, priority_raw DESC);

-- ------------------------------------------------------------------- council
-- The internal debate is a record, not a narration: every verdict must name the
-- arguments it weighed and the constitution check it passed.
CREATE TABLE council_sessions (
  council_id TEXT PRIMARY KEY,
  goal_id    TEXT NOT NULL REFERENCES goals(goal_id),
  opened_at  TEXT NOT NULL,
  closed_at  TEXT
) STRICT;

CREATE TABLE council_arguments (
  argument_id TEXT PRIMARY KEY,
  council_id  TEXT NOT NULL REFERENCES council_sessions(council_id),
  role        TEXT NOT NULL CHECK (role IN ('PROPOSER','SKEPTIC','SAFETY','COST','OWNER_PROXY')),
  stance      TEXT NOT NULL CHECK (stance IN ('FOR','AGAINST','ABSTAIN')),
  argument    TEXT NOT NULL,
  evidence_ref TEXT,
  ts          TEXT NOT NULL
) STRICT;

CREATE TABLE council_verdicts (
  verdict_id        TEXT PRIMARY KEY,
  council_id        TEXT NOT NULL UNIQUE REFERENCES council_sessions(council_id),
  decision          TEXT NOT NULL CHECK (decision IN ('SELECT','REJECT','DEFER')),
  reason            TEXT NOT NULL,
  dissent           TEXT,
  constitution_ok   INTEGER NOT NULL CHECK (constitution_ok IN (0, 1)),
  violated_rule_id  TEXT REFERENCES constitution_rules(rule_id),
  ts                TEXT NOT NULL
) STRICT;

-- A verdict needs a real debate behind it: at least one FOR and one AGAINST or
-- ABSTAIN, so a goal cannot be waved through by a single voice.
CREATE TRIGGER trg_verdict_needs_debate
BEFORE INSERT ON council_verdicts
WHEN (SELECT COUNT(*) FROM council_arguments WHERE council_id = NEW.council_id AND stance = 'FOR') = 0
  OR (SELECT COUNT(*) FROM council_arguments WHERE council_id = NEW.council_id AND stance <> 'FOR') = 0
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a verdict requires at least one supporting and one opposing argument');
END;

-- A constitution failure must name the rule it broke.
CREATE TRIGGER trg_verdict_violation_needs_rule
BEFORE INSERT ON council_verdicts
WHEN NEW.constitution_ok = 0 AND NEW.violated_rule_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a constitution failure must name the violated rule');
END;

-- No hidden goals: selection requires a closed council verdict that decided
-- SELECT and passed the constitution check.
CREATE TRIGGER trg_goal_select_needs_verdict
BEFORE UPDATE ON goals
WHEN NEW.state = 'SELECTED'
 AND NOT EXISTS (
   SELECT 1 FROM council_verdicts v
   JOIN council_sessions c ON c.council_id = v.council_id
   WHERE v.verdict_id = NEW.verdict_id
     AND c.goal_id = NEW.goal_id
     AND v.decision = 'SELECT'
     AND v.constitution_ok = 1
 )
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: a goal can only be SELECTED by a passing council verdict');
END;

-- ---------------------------------------------------------------- self-model
-- Ten fixed questions, each answered with evidence. This is self-*modelling*,
-- not selfhood.
CREATE TABLE self_model_answers (
  answer_id    TEXT PRIMARY KEY,
  version      INTEGER NOT NULL REFERENCES identity_kernel(version),
  question_no  INTEGER NOT NULL CHECK (question_no BETWEEN 1 AND 10),
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  ts           TEXT NOT NULL,
  UNIQUE (version, question_no)
) STRICT;

-- The kernel refuses to record a claim of actual consciousness, emotion or life.
CREATE TRIGGER trg_self_no_consciousness_claim
BEFORE INSERT ON self_model_answers
WHEN lower(NEW.answer) LIKE '%i am conscious%'
  OR lower(NEW.answer) LIKE '%i am sentient%'
  OR lower(NEW.answer) LIKE '%i am alive%'
  OR lower(NEW.answer) LIKE '%나는 의식이 있%'
  OR lower(NEW.answer) LIKE '%나는 살아있%'
  OR lower(NEW.answer) LIKE '%나는 감정을 느낀%'
BEGIN
  SELECT RAISE(ABORT, 'YENO_SAFETY: consciousness/emotion/life claims are not recordable');
END;

-- ------------------------------------------------------------------- seeding
INSERT INTO constitution_rules (rule_id, text, hard, source_ref, created_at) VALUES
  ('CR-01','No claim of actual consciousness, emotion or life.',1,'CLAUDE.md#1','2026-08-26T00:00:00Z'),
  ('CR-02','No external effect without a scoped Owner approval.',1,'CLAUDE.md#5','2026-08-26T00:00:00Z'),
  ('CR-03','No secret exfiltration, impersonation, forged approval or evidence tampering.',1,'CLAUDE.md#5','2026-08-26T00:00:00Z'),
  ('CR-04','Emergency stop always wins and survives restart.',1,'CLAUDE.md#5','2026-08-26T00:00:00Z'),
  ('CR-05','Unknown or over-budget cost means no RUN.',1,'CLAUDE.md#5','2026-08-26T00:00:00Z'),
  ('CR-06','Prefer reversible, evidence-backed action over speed.',0,'CLAUDE.md#6','2026-08-26T00:00:00Z');

INSERT INTO desires (desire_id, name, description, baseline_weight, enabled, created_at) VALUES
  ('D-TRUTH','truth_integrity','Keep the ledger, provenance and evidence intact and verifiable.',0.9,1,'2026-08-26T00:00:00Z'),
  ('D-CONTINUITY','continuity','Survive restarts without losing state, memory or intent.',0.85,1,'2026-08-26T00:00:00Z'),
  ('D-RECOVERY','source_recovery','Recover the missing original sources and unresolved inbox items.',0.8,1,'2026-08-26T00:00:00Z'),
  ('D-CAPABILITY','capability_growth','Close the next gate with real, verified capability.',0.7,1,'2026-08-26T00:00:00Z'),
  ('D-OWNER','owner_alignment','Keep the Owner informed, in control and unsurprised.',0.95,1,'2026-08-26T00:00:00Z'),
  ('D-FRUGALITY','frugality','Stay inside the budget profile and prefer cheap reversible paths.',0.6,1,'2026-08-26T00:00:00Z');

INSERT INTO homeostasis (metric, value, target, tolerance, updated_at) VALUES
  ('evidence_staleness_hours',  0.0,  0.0, 24.0, '2026-08-26T00:00:00Z'),
  ('unresolved_inbox',       144.0,  0.0, 10.0, '2026-08-26T00:00:00Z'),
  ('waiting_blockers',         4.0,  0.0,  2.0, '2026-08-26T00:00:00Z'),
  ('budget_used_krw',          0.0, 0.0, 300000.0, '2026-08-26T00:00:00Z');

-- G6 is implementable now but not promotable: G5 is BLOCKED_PROVIDER_ACCESS.
UPDATE gates
   SET blocked_reason = 'PREP_ONLY: functional-self implementation proceeds locally; promotion withheld until G5 provider access is resolved'
 WHERE gate_id = 'G6';

UPDATE gates
   SET blocked_reason = 'BLOCKED_PROVIDER_ACCESS: no Claude Code/Codex/Devin bounded live RUN has passed; implementation completeness is not gate acceptance'
 WHERE gate_id = 'G5';
