---
description: Read run_ledger.json and report where a build stands
argument-hint: [slug]
allowed-tools: Bash, Read
---

Run `npm run build:status -- $ARGUMENTS` and relay it.

With no slug it lists every build; with one it reports steps, the §18A lock, the
counts, the logged-model check and anything §34 has flagged for reissue.

Everything comes from `run_ledger.json`. E3: the ledger is "computed, never
hand-maintained" — so if the user disputes a number, look at the ledger and the
collections, never at your memory of the run.

Two things to call out when you see them, because they are easy to scroll past:

- **Any completed job whose logged model is off the arsenal.** §44.47 makes that
  a failed generation, not a delivered beat — discarded and re-run in the
  platform interface, never accepted because the frame looked good.
- **Rooms held at `held_property_plate_failed`.** §30G: their dwelling's plate
  did not pass, so no location plate was built against it. That is the "six
  houses" failure being prevented, and it needs the property plate fixed first.
