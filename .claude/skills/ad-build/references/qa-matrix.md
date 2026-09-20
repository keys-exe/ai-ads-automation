# E1 checks and E2 budgets

Full matrix: `sed -n '6424,6470p' standards/V7.51.3.md`.

## The checks that run today

| Check | Instrument | Threshold | On fail |
|---|---|---|---|
| Character count per prompt | minified length | ≤ 2,500 on any Kling-direct beat | Trim ladder (§37), recount |
| Model actually run | logged model on the completed job | exact match, **and in the arsenal** | Re-submit explicit; a logged `nano_banana_flash` or `flare` fails the job outright |
| Start frame completed before I2V | job status | `completed` | Wait; never submit on `queued` |
| Avatar sheet panels (§19) | the rendered sheet | six items, all pass | Reroll the sheet; never attach a failing sheet |
| Property hold (§30G) | first frame vs Property Sheet | shell, window side, view out, one standard of upkeep | Reroll; a shell mismatch is a fail, not a taste note |
| Scene hold (§30C) | first frame vs Location Sheet | anchors present, nothing invented | Reroll with `SCENE-REF` + `NEG-SCENE` |
| Coverage (§27B) | phrase inventory vs beat IDs | uncovered = 0 | Undelivered act until closed |

Counts are on the deliverable: `npm run build:status -- <slug>`.

## E2 — failure classes and budgets

`SAFETY_REJECT` · `PRESET_OVERRIDE` · `COMPLETION_404` · `QUALITY_FAIL` ·
`CONSISTENCY_FAIL` · `SYNC_DRIFT` · `ALIAS_MISMATCH`

**Two automatic rerolls per beat per failure class**, then the beat queues for a
human with its failure history attached. `rerollsSpent()` and
`budgetExhausted()` in `src/store/ledger.ts` read this off the ledger.

Retries never change the prompt silently — every changed prompt is a delivered
iteration (§16). And per §16B, **a re-roll is labelled as a re-roll**, with its
failure class and attempt number: "an unlabelled re-roll is how a beat quietly
consumes four."

## Three live corruption paths (§5, measured)

1. **The preset matcher will overwrite the capture spec.** `declined_preset_id`
   suppresses *one* preset and the matcher can chain. "An unattended batch run
   will silently take a preset and blow the capture spec."
2. **Safety classifiers score the raw prompt and do not parse negation.** A
   prohibited word inside a negative still counts as that word. Steer with a
   *positive* description instead. Negatives are for aesthetics, never safety.
3. **The model string may not reach the model.** Measured in this repo:
   `nano_banana_pro` logged `nano_banana_2` on two submissions. Nothing is
   routed there and a test enforces it. Read the logged model on every job.
