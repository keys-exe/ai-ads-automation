# ai-ads-automation

An executable implementation of the **Global Standards V7.51.3**
(`standards/V7.51.3.md`) — §18 steps 1–5, run from the CLI and from Claude Code.

**Load the `ad-build` skill** (`.claude/skills/ad-build/`) for anything to do
with running, resuming, checking, delivering or correcting a build. It routes to
the reference you need.

## Never read the Standards document whole

6,652 lines, ~109k words. Read the section you need, by number:

```bash
sed -n '1781,1880p' standards/V7.51.3.md    # §18 build order
```

The parsed store (`src/standards/registry.ts`) gives 486 sections keyed by
number and 240 Appendix A strings with their declared character counts. Every
step already assembles its system prompt from a *declared* section list — work
the same way.

## Conventions

- **`npm run typecheck` and `npm test` before you finish.** 108 tests; the
  §16A set in `test/render.test.ts` is conformance, not taste — each assertion
  quotes the clause it enforces.
- **`npm run standards:lint` if you touch the document.** E10: a cut failing
  lint does not ship. Baseline is 24 errors / 34 warnings
  (`docs/doc-lint-findings.md`) and must not grow. A hook runs this for you.
- **Comments explain why, not what.** The existing code quotes the § it
  implements where the rule is not obvious from the code. Match that density.
- **Never paraphrase an Appendix A string.** They are NORMATIVE. The model
  supplies fills; `src/generation/assemble.ts` pastes the locked blocks.
- **Never accept a job whose logged model is off the arsenal.** §44.47 makes it
  a failed generation, not a delivered beat.

## Layout

| Path | What |
|---|---|
| `src/standards/` | Parser, section registry, E10 doc-lint |
| `src/intake/` | The drop-folder classifier |
| `src/store/` | E3 ledger + E9 build tree (replaces Postgres) |
| `src/processes/` | §18 steps 1–5 |
| `src/generation/` | Arsenal guard, prompt assembly, MCP client, E2 retries |
| `src/instruments/` | §42 Part 1 — ffmpeg, tesseract, whisper |
| `src/delivery/` | §16A widgets, theme and renderer |
| `src/providers/` | HeyGen, ElevenLabs, Kling adapters (Phase 2, unverified) |
| `legacy/` | The old Next.js + Postgres surface. Excluded from tsconfig. Delete when ready. |

## Not built

§18 steps 6–8 (hooks gate, B-roll and body acts, CapCut block), I2V routing to
Kling/Wan/Seedance, the §37 trim ladders, and the voice/avatar route. Say so
plainly when asked for finished video rather than implying otherwise.

## Deviations from the document

Recorded in `.claude/skills/ad-build/references/deviations.md` and in every
build's ledger under `declared.overrides`. §45 requires an override against the
document to be stated once and recorded, never applied quietly.
