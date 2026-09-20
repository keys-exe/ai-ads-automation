# §18's flow — what runs, what it writes

Steps 1-5. **One gate, at step 6** (not built). Steps 3→4→5 chain in one pass:
"send, then straight on."

| # | Step | Class | Writes |
|---|---|---|---|
| 1 | Absorb the inspo video | DET | `artifacts/measurements.json`, `artifacts/absorption_sheet.json` |
| 2 | Absorb script, product, sheet; lock mode and model | DET | `phrase_inventory.json`, `collections/claims.json`, `collections/locks.json`, `run_ledger.json → declared` |
| 3 | Cast everyone who recurs | DET | `registries/roster.json`, avatar sheets generated, §19 panel check |
| 4 | Property and location maps | DET | `collections/properties.json`, `registries/scene.json`, `location_sheets/`, plates |
| 5 | Act map and wardrobe map | DET | `act_map.json`, `wardrobe_map.json`, `run_ledger.json → beats/storyDays/captureEvents` |

## The two internal gates that are real

**§19 panel check, before a sheet is used anywhere.** Six items. One failing
panel is a reroll of the sheet, not a note.

**§30G property plate, before any location plate is built against it.** A room
whose dwelling's plate failed is **held**, never generated against nothing —
that is the "six houses" failure, and it would be invisible in the output.

Both are marked HUMAN in E1 and run automatically here. The deviation is bounded
and is written up in `deviations.md`.

## Resuming

Everything is in `run_ledger.json` — E3 names it the source for
"resume-after-interruption". `--from N` restarts at a step; `--only N` runs one
step and does not carry on (use it after a §34 correction).

## Where the model is, and is not

The model derives — cast, locations, maps, the absorption reads. The model
**never writes a prompt**: it supplies fills and `src/generation/assemble.ts`
pastes the locked Appendix A blocks around them, in the assembly order the
section states.

## §42 Part 1 — measure before read

Seven instruments run before any creative interpretation, because "a label is
not a measurement." Missing binary → step 1 fails by name rather than falling
back to an estimate. `npm run ready` tells you which are absent.

One Part 1 row is deliberately *not* measured: the TH/B-roll ratio needs a
per-shot judgement no filter settles, so it is derived and **marked derived**.
