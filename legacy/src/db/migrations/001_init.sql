-- Schema for the build pipeline.
--
-- Shape follows Appendix E: E3 defines the run ledger, E4 the act-map row, E9
-- the build directory. The ledger is "computed, never hand-maintained", so the
-- tables below are the computation's inputs and `builds.ledger` is its cache.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS builds (
  id                BIGSERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  -- §E3: version_built_against. A build is pinned to the standards it was
  -- built under; a later version never silently reinterprets a finished build.
  standards_version TEXT NOT NULL,
  -- §E3 build-level `declared{}`: side, mechanism_claim, format, mode,
  -- model_lock{beat_class → model, variant, quality}. Written at step 2.
  declared          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ledger            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The upload bundle. One row per box on the upload panel.
-- 'product' and 'product_placement' may hold several images, hence no unique
-- constraint on (build_id, kind) for those two.
CREATE TYPE asset_kind AS ENUM (
  'inspo_video',
  'script',
  'product',
  'product_sheet',
  'product_placement'
);

CREATE TABLE IF NOT EXISTS assets (
  id           BIGSERIAL PRIMARY KEY,
  build_id     BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  kind         asset_kind NOT NULL,
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  byte_size    BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  -- Set where the inspo video arrived as a link rather than a file.
  source_url   TEXT,
  -- Extracted text for script / product sheet, so a process reads the asset
  -- without re-parsing the upload on every call.
  text_content TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_build_idx ON assets(build_id, kind);

-- One row per run of a process. Step 1 is ABSORB INSPO VIDEO; step 2 is
-- ABSORB THIS SCRIPT, PRODUCT[, PRODUCT PLACEMENT] AND PRODUCT SHEET.
CREATE TYPE process_status AS ENUM ('queued', 'running', 'done', 'failed', 'blocked');

CREATE TABLE IF NOT EXISTS processes (
  id           BIGSERIAL PRIMARY KEY,
  build_id     BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  -- §18 step number this process implements.
  step         SMALLINT NOT NULL,
  kind         TEXT NOT NULL,
  -- The exact operator-facing prompt string, stored so the run is auditable
  -- and so the placement variant is a record rather than a UI detail.
  prompt_label TEXT NOT NULL,
  status       process_status NOT NULL DEFAULT 'queued',
  queue_job_id TEXT,
  -- Per-stage progress for the UI: instruments, transcript, model, parse.
  stage        TEXT NOT NULL DEFAULT 'queued',
  error        TEXT,
  -- Token and cost accounting from response.usage.
  usage        JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processes_build_idx ON processes(build_id, step);

-- Artefacts a process produces. §16A routes each class to a widget shape.
CREATE TABLE IF NOT EXISTS artifacts (
  id         BIGSERIAL PRIMARY KEY,
  build_id   BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  process_id BIGINT REFERENCES processes(id) ON DELETE CASCADE,
  -- measurements | absorption_sheet | phrase_inventory | claims | locks | product_sheet
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artifacts_build_idx ON artifacts(build_id, kind);

-- §27B coverage ledger. Built at step 2 by a mechanical pass over the script.
-- Every row carries exactly one disposition and nothing falls through silently.
CREATE TABLE IF NOT EXISTS phrases (
  id             BIGSERIAL PRIMARY KEY,
  build_id       BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  -- 'P-001'. Sequential and contiguous — a gap is itself the alarm (§27B).
  phrase_id      TEXT NOT NULL,
  ordinal        INTEGER NOT NULL,
  text           TEXT NOT NULL,
  -- hook | permission | agitate | mechanism | proof | offer | close
  structural_job TEXT,
  -- BR-xx | TH-xx | MECH-xx | MERGED→P-0xx | BLOCKED. Assigned at step 5,
  -- null at step 2 where the inventory is a mechanical split only.
  disposition    TEXT,
  -- Why a BLOCKED row is blocked, with its section reference.
  blocked_reason TEXT,
  -- §27's trigger that caused the split, recorded so the split is auditable.
  split_trigger  TEXT,
  demo           TEXT,
  act            TEXT,
  UNIQUE (build_id, phrase_id)
);

CREATE INDEX IF NOT EXISTS phrases_build_idx ON phrases(build_id, ordinal);

-- §43A claim substantiation. Caught at step 2, before anything builds against it.
CREATE TABLE IF NOT EXISTS claims (
  id            BIGSERIAL PRIMARY KEY,
  build_id      BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  -- The claim as the script states it. Never rewritten (§43A).
  text          TEXT NOT NULL,
  -- 1 = sourced, 2 = sourced but qualified, 3 = unsourced → the beat is BLOCKED.
  tier          SMALLINT NOT NULL CHECK (tier IN (1, 2, 3)),
  kind          TEXT NOT NULL DEFAULT 'numeric',
  -- Tier 1 records the advertiser's source here; tier 2 records the gap.
  source        TEXT,
  qualification TEXT,
  phrase_ref    TEXT,
  -- Set once the advertiser moves a tier-3 claim. "Blocked is reported,
  -- never resolved" by the agent (§27B).
  resolved_at   TIMESTAMPTZ,
  resolved_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_build_idx ON claims(build_id, tier);

-- Every lock resolved at §18 step 2, one row each, with the section it binds.
-- §16A routes this artefact class to the Ledger widget.
CREATE TABLE IF NOT EXISTS locks (
  id         BIGSERIAL PRIMARY KEY,
  build_id   BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  -- 'mode' | 'camera' | 'format' | 'mechanism_claim' | 'declared_side' |
  -- 'model:readable_wordmark' | 'model:volume_broll' | ...
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  -- The section this lock binds, e.g. '18A'.
  section    TEXT NOT NULL,
  -- §18A requires a one-line reason on every model-route decision.
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, key)
);
