# AI Ads Build Pipeline

An executable implementation of the **Global Standards V7.51.3** build order.

This is step 1 and step 2 of the §18 eight-step flow: absorb the reference
video, then absorb the script, product, Product Sheet and — where one exists —
the product placement reference. The bundle is uploaded once and both steps
read from it.

## What runs

| Step | Button | Produces |
|---|---|---|
| 1 | `ABSORB INSPO VIDEO` | The Absorption Sheet — §42's seven parts |
| 2 | `ABSORB THIS SCRIPT, PRODUCT[, PRODUCT PLACEMENT] AND PRODUCT SHEET` | §27B phrase inventory, §43A claims pass, §18A Mode & Model Lock, the remaining step-2 locks |

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
      │                                        instruments (ffmpeg/tesseract/whisper)
      │                                                  │
      └──────────── Postgres ◀── artefacts ◀── Claude API (claude-opus-5)
```

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

Steps 3–8. Cast and reference sheets (§19), property and location maps (§30C,
§30G), the act map and wardrobe map (§14A), the hooks gate, B-roll and body
acts, and the CapCut block. Those are where generation starts, and where the
Higgsfield/Kling MCP connectors enter against E7's verified call templates.
Steps 1 and 2 need no generation at all.

The §16A delivery surface is present as tokens, the highlight-by-rule pass and
a Navigator; the prompt-widget carousel arrives with step 6, which is the first
step that delivers prompts.
