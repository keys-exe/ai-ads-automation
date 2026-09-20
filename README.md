# AI Ads Build Pipeline

An executable implementation of the **Global Standards V7.51.3** build order.

Steps 1–5 of the §18 eight-step flow. The bundle is uploaded once; every step
reads from it.

## What runs

| Step | Button | Produces |
|---|---|---|
| 1 | `ABSORB INSPO VIDEO` | The Absorption Sheet — §42's seven parts |
| 2 | `ABSORB THIS SCRIPT, PRODUCT[, PRODUCT PLACEMENT] AND PRODUCT SHEET` | §27B phrase inventory, §43A claims pass, §18A Mode & Model Lock, the remaining step-2 locks |
| 3 | `CAST — GENERATE REFERENCE SHEETS` | §19 sheets for everyone with 2+ beats, §19A axis tables, §22D voices, §20 constraint sheets |
| 4 | *(automatic)* | Property Sheet + plate, the eight-channel location pass, five-part Location Sheets, scene plates |
| 5 | *(automatic)* | Story days, the wardrobe ledger with its four audits, the act map, the coverage ledger |

## The chain

Steps 3, 4 and 5 run as one pass. §18: *"Steps 3, 4 and 5 send their artefact
and continue in the same pass — a handoff, not an approval. The only gate in
the build is step 6."* Starting the cast runs the rest without another click.

```
step 3  cast ──▶ sheets generated ──▶ §19 panel check ──▶ locked
                                                            │
step 4  ◀───────────────────────────────────────────────────┘
        property sheet ──▶ property plate ──▶ §30G check ──▶ locked
                                                   │
                                     location plates (PLATED only),
                                     property plate attached to each
                                                   │
step 5  ◀──────────────────────────────────────────┘
        story days ──▶ wardrobe ledger ──▶ act map ──▶ coverage ledger
```

The property plate is a hard internal gate. §30G: *"generated and checked
first, before any location plate is built against it."* A room whose dwelling's
plate failed is **held**, not generated against nothing — that is the "six
houses" failure the section exists to prevent, and it would be invisible in the
output.

Step 3 is the first step that spends credits, which is why it is the one a
person starts rather than firing off step 2.

## Who checks the visual gates

E1 marks §19's panel check and §30G's plate check **HUMAN**. Running them
automatically is a deliberate deviation, taken so the chain completes
unattended, and it is bounded:

- An automatic **fail** is authoritative — it triggers a reroll inside E2's
  two-attempt budget, which beats shipping a bad sheet.
- An automatic **pass** is not. The artefact locks so the chain proceeds, and
  `humanReviewPending` stays true. Nothing is ever recorded as human-checked
  when it was not.

## Prompt assembly

The model never writes a prompt. Appendix A strings are NORMATIVE — *"copy this
verbatim or with only the named substitutions"* — and several name the exact
sentence that must survive trimming. A model asked to write the prompt
paraphrases them, and every paraphrase is a silent trim of a tested string.

So the model supplies only the **fills**, and `src/generation/assemble.ts`
pastes the locked blocks around them in the assembly order the section states.
`assembleAvatarSheet` and the two plate assemblers are tested against the
document's own never-trimmed clauses.

One wrinkle worth knowing: the same slot is spelled four different ways across
the library — `[SKIRTING]` in `PLATE-PROP`, `[SKIRTING — profile, height,
colour]` in `PROP-SHELL`, `[RADIATOR]` against `[RADIATOR TYPE]`. E5 treats
those as one slot with one source, so the matcher resolves exact → head term →
word prefix rather than making callers reproduce every spelling.

The step-2 label carries its `PRODUCT PLACEMENT` clause only when a placement
reference is in the bundle. That is not a UI detail: with no worn-placement
reference, §9D blocks REVEAL beats until one exists, and the stored label is
the record of what the bundle actually held.

Neither step gates the other. §18 is explicit that steps 1–5 ship as one
delivery and nothing inside waits — "the only gate in the build is step 6."

## The measurement split

§42 Part 1 says objective instruments run before any creative interpretation,
and that "a label is not a measurement." So the model never estimates a number
it could have measured:

| Instrument | Tool | Settles |
|---|---|---|
| Duration, aspect, resolution | `ffprobe` | Format lock inputs (§3) |
| Scene-change detection | `ffmpeg` scene filter | Shot count, mean shot length, cut rhythm |
| Silence detection, two thresholds | `ffmpeg` silencedetect | Whether held beats exist, and where |
| Volume statistics | `ffmpeg` volumedetect + ebur128 | VO register — normalised-hot vs dynamic |
| Luminance timeline | `ffmpeg` signalstats | Register changes, act boundaries, the §15 delta achieved |
| OCR pass | `tesseract` | Text-overlay inventory — everything that is post (§17) |
| Transcript | Whisper | The Part 4 script absorption input |

One Part 1 row is deliberately *not* measured. The TH/B-roll ratio needs a
per-shot judgement no filter settles, so it is derived by the model from
sampled shot frames and marked `derived` — §45 forbids an unmarked derived
claim sitting beside a measured one.

## Architecture

```
Next.js (web)  ──enqueue──▶  pg-boss (Postgres)  ──▶  worker
      │                                                  │
      │                                   instruments (ffmpeg/tesseract/whisper)
      │                                   Claude API (claude-opus-5)
      │                                   Higgsfield MCP (image generation)
      │                                                  │
      └──────────── Postgres ◀── artefacts ◀─────────────┘
```

### Three constraints the MCP schemas carry that E7's templates do not

E7 records the call templates but not the tool limits. Each of these breaks a
naive implementation:

1. **`generate_image_batch` takes at most 12 requests.** A build with twenty
   locations is several batches, and indices must stay stable across them or
   the manifest stops matching the payload (§16B).
2. **`jobs_wait` takes at most 12 jobs and long-polls for at most 15 seconds.**
   E7's *"jobs_wait on every T2I before its I2V"* is a poll loop, not one call.
3. **`medias[].value` must be a media UUID or a prior job_id** — an https URL
   is rejected.

A fourth is worse than an error because it is silent: **omitting `use_unlim`
makes the server return an `unlim_choice` question and submit nothing.**
`buildImageCall` always sets it explicitly, along with `quality`, `resolution`
and — on GPT Image — `variant: sunburst`, because the catalogue defaults are
`low`, `1k` and the retired `flare`.

The worker is a separate process because the instruments are minutes of work
that no HTTP request should hold open. It is also the only container that needs
ffmpeg, tesseract and Whisper — see `docker/worker.Dockerfile`.

## The standards store

The document is committed at `standards/V7.51.3.md` and parsed into two stores:

- **486 sections**, keyed by section number, so each process assembles a system
  prompt from a *declared* section list rather than pasting 679KB into every
  call. Step 1 loads 11 sections; step 2 loads 17.
- **240 locked strings** from Appendix A with their declared character counts.

The assembled prefix is identical across every run of a given process, so it
carries a 1-hour cache breakpoint and is read at ~0.1× after the first call.
Build-specific content always goes *after* the breakpoint.

### Doc-lint

Appendix E10 defines a standing pre-cut check list and says "a cut failing lint
does not ship." `npm run standards:lint` runs the computable ones:

```
doc-lint: 24 errors, 34 warnings
```

Those errors are real and they are in the document, not the parser — see
`docs/doc-lint-findings.md`.

## Setup

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL and ANTHROPIC_API_KEY
npm run db:migrate
npm run user -- you@example.com "Your Name" <password>

npm run dev                        # web
npm run worker                     # worker, in a second terminal
```

The worker needs `ffmpeg`, `tesseract` and `whisper` on PATH. Without them,
step 1 fails immediately with a named missing instrument rather than silently
falling back to an estimate.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Web app |
| `npm run worker` | Background worker |
| `npm run db:migrate` | Apply `src/db/schema.sql` (idempotent) |
| `npm run standards:lint` | E10 doc-lint; exits non-zero on any error |
| `npm test` | Unit tests, including the §16A highlight rules |
| `npm run user -- <email> "<name>" <password>` | Add or update a team member |

## What is not here yet

Steps 6–8: the hooks gate (the build's only real gate), B-roll and body acts,
and the CapCut block. Those are the steps that deliver beat prompts, so they
are also where the §16A prompt-widget carousel and the I2V routing to Kling,
Wan and Seedance arrive.

The §16A delivery surface is present as tokens, the highlight-by-rule pass and
a Navigator.
