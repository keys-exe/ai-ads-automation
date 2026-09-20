---
description: Classify builds/<slug>/inbox/ and run §18 steps 1-5 straight through
argument-hint: <slug> [--no-generate] [--from N] [--only N] [--force]
allowed-tools: Bash, Read, Skill
---

Run a build. Arguments: `$ARGUMENTS`

1. Load the `ad-build` skill if it is not already loaded.
2. If no slug was given, list `builds/*/` and ask which one — do not guess.
3. Run `npm run build:run -- $ARGUMENTS` from the repo root.
4. Relay the §16B stream as it comes: the manifest above each batch, the job
   ids written back against their refs. Do not summarise it away — a job id that
   cannot be traced to its ref cannot be scored, ledgered or reissued.
5. If the run stops because the classifier could not place a file, read
   `references/intake.md` and tell the user the three ways to fix it. Do not
   re-run with `--force` on your own.
6. When it finishes, report in this order and no more than a few lines:
   - the Mode & Model Lock (§18A) — mode, and model per beat class
   - the counts: phrases, uncovered, cast locked vs needs-a-human, locations
     plated vs held, act-map rows
   - anything §5 queued for the platform UI
   - then offer `/deliver <slug>`.

If a step fails, say which step, quote the error, and stop. Do not retry a
generation call on your own — E2's budget is two automatic rerolls per beat per
failure class and the runner already spends them.
