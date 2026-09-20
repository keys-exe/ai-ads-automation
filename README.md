# AI Ads Build Pipeline

An executable implementation of the **Global Standards V7.51.3** build order,
run from the command line and from Claude Code. No server, no database.

Drop a bundle in a folder, run one command, and §18 steps 1–5 flow through
without stopping.

```bash
mkdir -p builds/my-ad/inbox
cp reference.mp4 script.md product-sheet.md hero.jpg builds/my-ad/inbox/
npm run build:run -- my-ad
npm run deliver  -- my-ad          # then open the file it prints
```

## What runs

| Step | Produces |
|---|---|
| 1 | The Absorption Sheet — §42's seven parts, over real instrument measurements |
| 2 | §27B phrase inventory, §43A claims pass, §18A Mode & Model Lock, the remaining step-2 locks |
| 3 | §19 sheets for everyone with 2+ beats, §19A axis tables, §22D voices, §20 constraint sheets |
| 4 | Property Sheet + plate, the eight-channel location pass, five-part Location Sheets, scene plates |
| 5 | Story days, the wardrobe ledger with its four audits, the act map, the coverage ledger |

**Steps 6–8 are not built** — the hooks gate, B-roll and body acts, and the
CapCut block. Neither is I2V routing to Kling, Wan or Seedance. Those are the
steps that deliver finished video.

## The chain

§18: *"Steps 3, 4 and 5 send their artefact and continue in the same pass — a
handoff, not an approval. The only gate in the build is step 6."*

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

Steps 1 and 2 gate nothing and are gated by nothing. A step-1 failure is
recorded and step 2 runs anyway — "steps 1–5 ship as one delivery and nothing
inside waits."

The property plate is a hard internal gate. §30G: *"generated and checked
first, before any location plate is built against it."* A room whose dwelling's
plate failed is **held**, not generated against nothing — that is the "six
houses" failure the section exists to prevent, and it would be invisible in the
output.

## Commands

| Command | What it does |
|---|---|
| `npm run ready` | Credentials and §42 instruments, with what each missing one blocks |
| `npm run build:run -- <slug>` | Classify the inbox and run steps 1–5 |
| `npm run build:run -- <slug> --no-generate` | Assemble and log every call, submit none |
| `npm run build:run -- <slug> --from 4` | Resume at a step |
| `npm run build:run -- <slug> --only 4` | Run one step and do not carry on |
| `npm run build:status -- <slug>` | Where the build stands, from `run_ledger.json` |
| `npm run deliver -- <slug>` | Render the §16A deliverables as local HTML |
| `npm run standards:lint` | E10 doc-lint; exits non-zero on any error |
| `npm test` | 108 tests, including the §16A conformance set |

From Claude Code: `/build`, `/status`, `/deliver` and `/correct`, routed by the
`ad-build` skill in `.claude/skills/`.

## The intake

One folder, mixed files, no form.

```
builds/<slug>/inbox/
  anything.mp4          → inspo_video
  script.md             → script                (required)
  product-sheet.md      → product_sheet         (optional — created where absent)
  product-sheet.py      → the Appendix B .py companion
  *.jpg *.png           → product
  placement/*.jpg       → product_placement     (optional)
  bundle.json           → explicit manifest, wins outright
```

Extension decides the class, name decides the role. A file it cannot place is
**reported and the run stops** — §18 step 2's verification depends on the bundle
being what it claims, and a wrong guess is invisible until beat forty.

## State: the E9 tree, not a database

Appendix E9 specifies the layout and says why: *"one beat, one pair of files, so
§34 global corrections, coverage diffs and reissue passes run as scripts over
the tree, never as memory."*

```
builds/<slug>/
  bundle.json  build.json  run_ledger.json
  phrase_inventory.json  act_map.json  wardrobe_map.json
  registries/{roster,scene}.json   location_sheets/
  collections/{claims,locks,properties,story_days,capture_events,generation_jobs}.json
  artifacts/{measurements,absorption_sheet,script_absorption,cast,locations,maps}.json
  beats/{BEAT-ID}.t2i.txt   deliveries/*.html
```

`run_ledger.json` is Appendix E3, verbatim — per-beat rows plus build-level
`property`, `plates`, `subjects`, `story_days`, `capture_events`, `declared`
and `version_built_against`. E3: *"computed, never hand-maintained."* It is
also what `--from` resumes off.

Artefacts are tracked in git; the inbox, returned media and rendered HTML are
not.

## Delivery — §16A on a local file

§16A requires every deliverable to arrive on an interactive widget, and fixes
the carousel at implementation depth: *"a batch that deviates from it is a §34
correction, not a style preference."*

`npm run deliver` writes self-contained HTML to `builds/<slug>/deliveries/` —
the four widget shapes, the locked carousel, the six highlight colours in both
modes, counts computed from the exact string the copy button holds, and copy
that lifts raw text so colour never reaches the clipboard. Nothing in them
reaches the network.

## Prompt assembly

The model never writes a prompt. Appendix A strings are NORMATIVE — *"copy this
verbatim or with only the named substitutions"* — and several name the exact
sentence that must survive trimming. A model asked to write the prompt
paraphrases them, and every paraphrase is a silent trim of a tested string.

So the model supplies only the **fills**, and `src/generation/assemble.ts`
pastes the locked blocks around them in the assembly order the section states.

## The measurement split

§42 Part 1 says objective instruments run before any creative interpretation,
and that *"a label is not a measurement."*

| Instrument | Tool | Settles |
|---|---|---|
| Duration, aspect, resolution | `ffprobe` | Format lock inputs (§3) |
| Scene-change detection | `ffmpeg` scene filter | Shot count, mean shot length, cut rhythm |
| Silence detection, two thresholds | `ffmpeg` silencedetect | Whether held beats exist, and where |
| Volume statistics | `ffmpeg` volumedetect + ebur128 | VO register |
| Luminance timeline | `ffmpeg` signalstats | Register changes, act boundaries, the §15 delta |
| OCR pass | `tesseract` | Text-overlay inventory — everything that is post (§17) |
| Transcript | Whisper | The Part 4 script absorption input |

One Part 1 row is deliberately *not* measured: the TH/B-roll ratio needs a
per-shot judgement no filter settles, so it is derived and **marked derived** —
§45 forbids an unmarked derived claim sitting beside a measured one.

## Model routing on this connector

`nano_banana_pro` does not survive the connector: two submissions, different
prompts, different batches, both completed logging `nano_banana_2`
(`docs/measurements.md` M1, M4). §44.47 makes the logged model the evidence, so
every route to it fails verification. Nothing is routed there, and a test
enforces that rather than leaving it to a comment.

| Beat class | Route |
|---|---|
| Avatar and recurring-subject sheets | `gpt_image_2_5` Sunburst |
| Readable wordmark | `gpt_image_2_5` Sunburst |
| Candid face seeds, talking-head seeds | `gpt_image_2_5` Sunburst |
| Volume B-roll, property and location plates | `nano_banana_2` |
| Mechanism A–C | `nano_banana_2` — classifier threshold, never GPT Image |

## Where this departs from the document

Recorded rather than applied quietly (§45), and written into every build's
ledger under `declared.overrides`. Full list:
`.claude/skills/ad-build/references/deviations.md`.

The short version: the deliverable here is media rather than copy-ready prompts
(§1, operator's decision); §19's panel check and §30G's plate check run
automatically although E1 marks them HUMAN (bounded — an automatic **pass**
never records as human-checked); and §5's standing rule caps what can run
unattended at all.

## The standards store

The document is committed at `standards/V7.51.3.md` and parsed into two stores:

- **486 sections**, keyed by section number, so each process assembles a system
  prompt from a *declared* section list rather than pasting 679KB into every
  call. Step 1 loads 11 sections; step 2 loads 17.
- **240 locked strings** from Appendix A with their declared character counts.

The assembled prefix is identical across every run of a given process, so it
carries a 1-hour cache breakpoint and is read at ~0.1× after the first call.

### Doc-lint

E10 defines a standing pre-cut check list and says *"a cut failing lint does not
ship."* `npm run standards:lint` runs the computable ones:

```
doc-lint: 24 errors, 34 warnings
```

Those errors are real and they are in the document, not the parser — see
`docs/doc-lint-findings.md`. The baseline must not grow.

## Setup

```bash
npm install
cp .env.example .env        # ANTHROPIC_API_KEY, then HIGGSFIELD_MCP_URL for step 3+
npm run ready               # says what is missing and what it blocks
```

Step 1 needs `ffmpeg`, `tesseract` and `whisper` on PATH. Without them it fails
with a named missing instrument rather than silently falling back to an
estimate. `docker/instruments.Dockerfile` builds an image that has all three.

## `legacy/`

The previous Next.js + Postgres + pg-boss surface — web app, API routes, auth,
the encrypted connections table, the worker, and the voice/avatar runner. It is
kept only so nothing is lost in the move and is excluded from the TypeScript
program. Delete it when you are satisfied: `git rm -r legacy`.

The ElevenLabs and HeyGen adapters were **not** moved there — they are live in
`src/providers/`, awaiting the Phase 2 wiring, and both are marked unverified
against live docs.
