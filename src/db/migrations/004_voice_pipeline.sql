-- The voice + avatar talking-head route.
--
-- A different production route from the standards' Kling-native talking head,
-- and a deliberate override of §44.7 (see docs/voice-route.md). The chain:
--
--   Kling 2×10s clips ──┬── audio ──▶ ElevenLabs IVC ──▶ cloned voice
--                       └── video ──▶ HeyGen Avatar V identity
--   script ──▶ cleaned to spoken lines ──▶ TTS takes ──▶ scored ──▶ chosen
--   chosen take ──▶ split 3–4 parts ──▶ Avatar V render per part
--
-- The two Kling clips do double duty: ElevenLabs needs their audio, Avatar V
-- needs their video. That is why source_clips is one table feeding both.

CREATE TABLE IF NOT EXISTS voice_runs (
  id           BIGSERIAL PRIMARY KEY,
  build_id     BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  character_id TEXT,
  status       TEXT NOT NULL DEFAULT 'queued',
  stage        TEXT NOT NULL DEFAULT 'queued',
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS voice_runs_build_idx ON voice_runs(build_id);

-- The Kling clips. Each carries both an extracted audio track (for the voice
-- clone) and the original video (for the avatar identity).
CREATE TABLE IF NOT EXISTS source_clips (
  id             BIGSERIAL PRIMARY KEY,
  run_id         BIGINT NOT NULL REFERENCES voice_runs(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  prompt         TEXT NOT NULL,
  provider_job   TEXT,
  video_url      TEXT,
  video_path     TEXT,
  -- ElevenLabs IVC takes audio samples, not video, so the track is extracted
  -- before upload. This column is the whole reason the extract step exists.
  audio_path     TEXT,
  duration_s     NUMERIC,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_clips_run_idx ON source_clips(run_id, ordinal);

CREATE TABLE IF NOT EXISTS cloned_voices (
  id            BIGSERIAL PRIMARY KEY,
  run_id        BIGINT NOT NULL REFERENCES voice_runs(id) ON DELETE CASCADE,
  build_id      BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  character_id  TEXT,
  -- The provider's voice id. This is the lock: §22C's consistency problem
  -- disappears because the voice is an id rather than a prose description.
  provider_voice_id TEXT,
  name          TEXT NOT NULL,
  sample_count  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The script after the visuals are stripped out: spoken lines only.
CREATE TABLE IF NOT EXISTS spoken_scripts (
  id            BIGSERIAL PRIMARY KEY,
  run_id        BIGINT NOT NULL REFERENCES voice_runs(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  char_count    INTEGER NOT NULL,
  word_count    INTEGER NOT NULL,
  -- What was removed, so the strip is auditable rather than trusted.
  removed       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per TTS take. Several are generated and one is chosen.
CREATE TABLE IF NOT EXISTS tts_takes (
  id            BIGSERIAL PRIMARY KEY,
  run_id        BIGINT NOT NULL REFERENCES voice_runs(id) ON DELETE CASCADE,
  ordinal       INTEGER NOT NULL,
  model         TEXT NOT NULL,
  provider_job  TEXT,
  audio_url     TEXT,
  audio_path    TEXT,
  duration_s    NUMERIC,
  -- Measured by the ffmpeg instruments: entry latency (§28G), internal gaps,
  -- loudness register (§22D). Never a felt judgement.
  scores        JSONB NOT NULL DEFAULT '{}'::jsonb,
  rank          INTEGER,
  selected      BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tts_takes_run_idx ON tts_takes(run_id, ordinal);

-- The chosen take, split into the parts HeyGen renders.
CREATE TABLE IF NOT EXISTS script_segments (
  id           BIGSERIAL PRIMARY KEY,
  run_id       BIGINT NOT NULL REFERENCES voice_runs(id) ON DELETE CASCADE,
  ordinal      INTEGER NOT NULL,
  text         TEXT NOT NULL,
  char_count   INTEGER NOT NULL,
  word_count   INTEGER NOT NULL,
  -- Where the split fell and why, so a bad cut is traceable to its rule.
  split_reason TEXT,
  -- Offsets into the chosen take's audio, for cutting it per segment.
  start_s      NUMERIC,
  end_s        NUMERIC,
  UNIQUE (run_id, ordinal)
);

CREATE TABLE IF NOT EXISTS avatar_renders (
  id            BIGSERIAL PRIMARY KEY,
  run_id        BIGINT NOT NULL REFERENCES voice_runs(id) ON DELETE CASCADE,
  segment_id    BIGINT REFERENCES script_segments(id) ON DELETE CASCADE,
  ordinal       INTEGER NOT NULL,
  engine        TEXT NOT NULL DEFAULT 'avatar_v',
  provider_job  TEXT,
  video_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS avatar_renders_run_idx ON avatar_renders(run_id, ordinal);
