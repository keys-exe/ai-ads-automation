---
name: ad-build
description: Run an ad/VSL build against the Global Standards V7.51.3 — absorb an inspo video, script, product images and Product Sheet from one drop folder, then flow §18 steps 1-5 (absorption, mode and model lock, cast, property and locations, act map and wardrobe map) and render the §16A deliverables as local HTML. Use when the user asks to start, run, resume, check or deliver a build, drops a bundle in builds/<slug>/inbox/, asks about a beat, a lock, a claim, a plate or a §-numbered rule, or asks to correct a delivered beat (§34).
---

# Running a build

The Standards document is `standards/V7.51.3.md` — 6,652 lines, ~109k words.
**Never read it whole.** Every step already assembles its own system prompt from
a declared section list (`src/lib/claude.ts`), and you should work the same way:
read the section you need, by number.

    sed -n '1781,1880p' standards/V7.51.3.md     # §18 build order
    npx tsx -e "..."                             # or use the parsed store

The parsed store gives 486 sections keyed by number and 240 Appendix A strings
with their declared character counts — `src/standards/registry.ts`.

## The one thing to know first

§18's eight-step flow has **exactly one gate, at step 6**. Steps 1-5 "ship as
one opening delivery. Nothing inside it waits." So the pipeline runs them
straight through and you do not stop to ask between them.

Steps 6-8 (hooks, B-roll and body acts, the CapCut block) are **not built yet**.
Neither is I2V routing. If the user asks for finished video, say so plainly
rather than implying the pipeline produces it today.

## Commands

| Want | Run |
|---|---|
| Check credentials and instruments | `npm run ready` |
| Start or resume a build | `npm run build:run -- <slug>` |
| Rehearse without image spend | `npm run build:run -- <slug> --no-generate` |
| Re-run one step after a correction | `npm run build:run -- <slug> --only 4` |
| Where is this build up to | `npm run build:status -- <slug>` |
| Render the §16A deliverables | `npm run deliver -- <slug>` |
| E10 doc-lint before a version cut | `npm run standards:lint` |

The slash commands `/build`, `/status`, `/deliver` and `/correct` wrap these.

## References — read the one you need

| File | When |
|---|---|
| `references/intake.md` | The user is dropping files in, or the classifier could not place one |
| `references/flow.md` | What each of §18's steps does, what it writes, and where |
| `references/qa-matrix.md` | A check failed, or you need E1's instrument/threshold/on-fail for one |
| `references/corrections.md` | The user flags a problem with a delivered beat (§34) |
| `references/deviations.md` | Anything about where this pipeline departs from the document |

## Working rules (§45)

- **Take a position.** Recommend one option and say why. Do not present neutral lists.
- **Show the number.** Character counts, word counts against §28H, uncovered
  phrases, axis clearance — print them. "A check the user has to ask for is a
  check nobody runs."
- **Mark unverified claims as unverified.** Never let a derived claim sit
  unmarked beside a measured one.
- **Confirm correctness in one line and move on.** Do not over-explain.

## Two hard rules you will be tempted to break

**Never write or paraphrase an Appendix A string.** They are NORMATIVE — "copy
this verbatim or with only the named substitutions" — and several name the exact
clause that must survive trimming. The model supplies *fills*;
`src/generation/assemble.ts` pastes the locked blocks around them. A paraphrase
is a silent trim of a tested string.

**Never accept a job whose logged model is off the arsenal.** §44.47: a job
logging `nano_banana_flash` or `flare` is a *failed generation* — "discarded,
re-run in the platform interface, never accepted because the frame happened to
look good." `npm run build:status` reads this back for you.
