# Where this pipeline departs from the document

§45: an override against the document is **stated once and recorded**, never
applied quietly. Each of these is also written into every build's
`run_ledger.json` under `declared.overrides`, so it travels with the artefact.

## 1. The deliverable is media, not prompts — operator's decision

§1: "The deliverable is always copy-ready prompts the user pastes straight into
their tools — never the media itself." This pipeline fires the calls and
delivers results.

Prompts are still written to `beats/*.t2i.txt` under E9, because §34 corrections
and reissue passes need them, and they are reachable behind the Seed/Clip toggle
in the rendered HTML. **Override against the standard, on the operator's
instruction, recorded.**

## 2. §19 and §30G checks run automatically — E1 marks them HUMAN

Taken so the step-3 → step-4 → step-5 chain completes unattended. Bounded, and
the bound is the point:

- An automatic **fail** is authoritative — it triggers a reroll inside E2's
  two-attempt budget, which beats shipping a bad sheet.
- An automatic **pass** is **not**. The artefact locks so the chain proceeds and
  `humanReviewPending` stays true. **Nothing is ever recorded as human-checked
  when it was not.**

## 3. Model-critical work cannot run unattended — §5's ceiling, not a choice

§5's standing rule: "model-critical work runs in the platform's own interface,
where the model is selected rather than passed." Measured here: `nano_banana_pro`
does not survive the connector — two submissions, different prompts, different
batches, both logged `nano_banana_2` (`docs/measurements.md` M1, M4).

So unattended generation runs on `gpt_image_2_5` Sunburst and `nano_banana_2`
only. A beat class needing Pro is recorded and queued for the platform UI with
its prompt ready — never accepted on the wrong model.

## 4. §16A's widgets are local files, not a served surface

§16A requires an interactive widget. There is no server, so the widgets are
written to `builds/<slug>/deliveries/*.html` and opened from disk. The locked
reference plate is implemented as written — carousel, dots, disabled chevrons,
24px script line, computed counts, raw-text copy, six colours in both modes.

One substitution: §16A names Tabler icon classes (`ti-chevron-left`, `ti-copy`),
which need an icon font. A file opened from disk with no network cannot fetch
one, so the glyphs are inlined as SVG and the class names kept.

## 5. Steps 6-8 do not exist

Hooks, B-roll and body acts, and the CapCut block are not built, and neither is
I2V routing to Kling, Wan or Seedance. The §37 trim ladders are unimplemented.
The voice and avatar route (`legacy/src/processes/voice/run.ts`) is written but
not ported — its ElevenLabs and HeyGen adapters are in `src/providers/` and both
are marked **unverified against live docs**.

Say this plainly when asked for finished video.
