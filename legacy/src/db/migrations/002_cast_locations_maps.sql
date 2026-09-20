-- Steps 3, 4 and 5: cast, property and locations, act map and wardrobe map.
--
-- The chain these tables carry is §30G's, stated as a rule:
--   Property plate → attached to every location-plate generation
--                  → each room's plate attached to that room's beats.
-- Which is why `properties` is generated and checked before `locations`, and
-- `locations.property_plate_job_id` records which plate each room was built
-- against rather than leaving the link implicit.

-- Every generation call the pipeline makes, with the job it produced.
-- §E3's ledger is computed from this, never hand-maintained; §16B requires
-- every job id to be traceable back to its beat and its script line.
CREATE TABLE IF NOT EXISTS generation_jobs (
  id            BIGSERIAL PRIMARY KEY,
  build_id      BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  process_id    BIGINT REFERENCES processes(id) ON DELETE SET NULL,
  -- avatar_sheet | property_plate | location_plate | ...
  purpose       TEXT NOT NULL,
  -- The entity this generation belongs to: 'C-01', 'LOC-03', 'DWELL-01'.
  ref           TEXT NOT NULL,
  -- §16B: the label stated immediately above the call. A bare job id is undelivered.
  label         TEXT NOT NULL,
  -- Position in the submitted batch. Item n of the payload is item n of the manifest.
  batch_index   INTEGER NOT NULL,
  model         TEXT NOT NULL,
  params        JSONB NOT NULL,
  prompt        TEXT NOT NULL,
  job_id        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  -- §44.47: read the logged model on every completed job. A logged retired
  -- model is a failed generation, never entered here as delivered.
  logged_model  TEXT,
  result_urls   JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempts      INTEGER NOT NULL DEFAULT 0,
  failures      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS generation_jobs_build_idx ON generation_jobs(build_id, purpose);
CREATE INDEX IF NOT EXISTS generation_jobs_job_idx ON generation_jobs(job_id);

-- §18 step 3. Every subject with two or more beats on the step-2 inventory:
-- the narrator, every named side character, and every recurring anonymous
-- B-roll subject (§30E Part 1). One-off subjects are not sheeted (§13).
CREATE TABLE IF NOT EXISTS characters (
  id                BIGSERIAL PRIMARY KEY,
  build_id          BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  -- 'C-01' for named cast, 'S-01' for recurring anonymous subjects.
  character_id      TEXT NOT NULL,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL,
  is_narrator       BOOLEAN NOT NULL DEFAULT false,
  speaks            BOOLEAN NOT NULL DEFAULT false,
  beat_count        INTEGER NOT NULL DEFAULT 0,
  -- §19A's eight axes. Shipped with the sheet as the axis table; a sheet
  -- delivered without it is undelivered.
  axes              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Clearance count against every roster entry. The gate is five of eight.
  clearance         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- §22D's seven axes plus age wear and stress register. Speaking cast only.
  voice             JSONB,
  -- §20's constraint sheet. Speaking cast only.
  constraint_sheet  JSONB,
  -- §14A: the character's own class register, a subset of the six layers.
  wardrobe_classes  JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_item    TEXT,
  -- The sheet itself.
  sheet_prompt      TEXT,
  sheet_job_id      TEXT,
  sheet_media_id    TEXT,
  sheet_url         TEXT,
  sheet_status      TEXT NOT NULL DEFAULT 'pending',
  -- §19's panel check — a gate before the sheet is used anywhere.
  panel_check       JSONB,
  -- Identity markers read off the RENDER, never off the prompt (§7).
  locked_markers    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, character_id)
);

CREATE INDEX IF NOT EXISTS characters_build_idx ON characters(build_id);

-- §30G. One per dwelling, where two or more locations are rooms of one house.
CREATE TABLE IF NOT EXISTS properties (
  id                BIGSERIAL PRIMARY KEY,
  build_id          BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  dwelling_id       TEXT NOT NULL,
  -- The seven fields: type_and_era, shell, floor_map, orientation,
  -- carried_elements, exterior, standing_negatives.
  fields            JSONB NOT NULL DEFAULT '{}'::jsonb,
  plate_prompt      TEXT,
  plate_job_id      TEXT,
  plate_media_id    TEXT,
  plate_url         TEXT,
  plate_status      TEXT NOT NULL DEFAULT 'pending',
  -- Every shell element readable · one age of building · daylight only from
  -- the door glass · nothing styled, nobody in frame.
  plate_check       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, dwelling_id)
);

-- §30C. Derived by the eight-channel pass over the step-2 phrase inventory.
CREATE TABLE IF NOT EXISTS locations (
  id                     BIGSERIAL PRIMARY KEY,
  build_id               BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  location_id            TEXT NOT NULL,
  name                   TEXT NOT NULL,
  -- PLATED (2+ beats) | INCIDENTAL (1 beat) | TRAVERSED (moved through)
  tier                   TEXT NOT NULL,
  -- Which derivation channel surfaced it — C0 through C8.
  channel                TEXT NOT NULL,
  beat_count             INTEGER NOT NULL DEFAULT 0,
  -- STORY (the narrator's) or GENERIC (§30B Part 3).
  ownership              TEXT NOT NULL DEFAULT 'STORY',
  -- Null where the location stands alone rather than being a room of the dwelling.
  dwelling_id            TEXT,
  -- The five-part Location Sheet plus §22A's profile as part six.
  sheet                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Three to five named, distinctive, immovable objects. Restated every beat.
  anchors                JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- TRAVERSED locations carry a GEO-LINE and one landmark instead of a plate.
  geo_line               TEXT,
  landmark               TEXT,
  plate_prompt           TEXT,
  plate_job_id           TEXT,
  plate_media_id         TEXT,
  plate_url              TEXT,
  -- 'not_required' on INCIDENTAL and TRAVERSED: a plate is a consistency
  -- device and a room with nothing to be consistent against does not earn one.
  plate_status           TEXT NOT NULL DEFAULT 'pending',
  -- Which property plate this room's plate was generated against (§30G chain).
  property_plate_job_id  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, location_id)
);

CREATE INDEX IF NOT EXISTS locations_build_idx ON locations(build_id, tier);

-- §14A. One row per story day; the day carries the outfit.
CREATE TABLE IF NOT EXISTS story_days (
  id            BIGSERIAL PRIMARY KEY,
  build_id      BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  act           TEXT,
  -- Which of D1-D5 surfaced this day.
  channel       TEXT NOT NULL,
  subject       TEXT NOT NULL,
  -- The six-layer garment stack plus its colour family.
  outfit        JSONB NOT NULL DEFAULT '{}'::jsonb,
  colour_family TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, day, subject)
);

-- §E8. A maximal run of consecutive beats sharing one location, one continuous
-- story-time and one filming premise. Inherits its day's outfit.
CREATE TABLE IF NOT EXISTS capture_events (
  id          BIGSERIAL PRIMARY KEY,
  build_id    BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL,
  story_day   TEXT NOT NULL,
  location_id TEXT NOT NULL,
  -- CONCEALED | VISIBLE | REVEAL (§9D).
  visibility  TEXT NOT NULL DEFAULT 'CONCEALED',
  alibi       TEXT,
  beats       JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (build_id, event_id)
);

-- §E4's act-map row schema, one row per beat.
CREATE TABLE IF NOT EXISTS act_map_rows (
  id                BIGSERIAL PRIMARY KEY,
  build_id          BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  beat_id           TEXT NOT NULL,
  ordinal           INTEGER NOT NULL,
  act               TEXT NOT NULL,
  phrase_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- TH | BR | MECH | PRODUCT | CTA
  type              TEXT NOT NULL,
  register          TEXT,
  rig               TEXT,
  frame_side        TEXT,
  framing_step      TEXT,
  energy            TEXT,
  valence           TEXT,
  ownership         TEXT,
  -- The §30B function: ILLUSTRATE, DEMONSTRATE, PROVE, CONTRAST...
  function          TEXT,
  subject           TEXT,
  alibi             TEXT,
  location_id       TEXT,
  -- Both mandatory on every row (E4, added V7.48.8). A row carrying a
  -- wardrobe_ref but no story_day is the failure that correction removed.
  story_day         TEXT NOT NULL,
  capture_event_id  TEXT NOT NULL,
  sequence_id       TEXT,
  geo_line_ref      TEXT,
  wardrobe_ref      TEXT,
  duration          INTEGER,
  closure_word      TEXT,
  stress_word       TEXT,
  bound_move_word   TEXT,
  -- absent | worn | held | seated | demo
  product_state     TEXT NOT NULL DEFAULT 'absent',
  -- CONCEALED | VISIBLE | REVEAL
  visibility        TEXT,
  claims            JSONB NOT NULL DEFAULT '[]'::jsonb,
  plant_payoff      TEXT,
  cover_point       TEXT,
  notes             TEXT,
  UNIQUE (build_id, beat_id)
);

CREATE INDEX IF NOT EXISTS act_map_build_idx ON act_map_rows(build_id, ordinal);
