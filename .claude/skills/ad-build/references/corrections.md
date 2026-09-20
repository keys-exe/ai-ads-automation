# §34 — the correction protocol

When the user flags a problem with a specific shot:

1. Return **only** the corrected block, labelled with its beat ID, as a direct
   drop-in swap.
2. Do not restate surrounding beats.
3. Do not re-explain the system.
4. Confirm the fix in one line, then stop.

## The four properties, all of them load-bearing

**Corrections are global.** Scan every other beat for the same flaw and fix it
everywhere — then say in one line which other IDs were also corrected. This is a
scan over `builds/<slug>/beats/`, not a memory exercise; E9 designed the tree for
exactly this.

**Corrections are retroactive.** Name which already-delivered IDs are now
invalid and need reissuing. Write `reissueFlag: { section, reason }` onto those
ledger rows so the next pass finds them.

**Corrections are permanent.** Never reintroduce a fixed flaw in new work.

**Corrections must reach the document, and they have a deadline.** When a
correction is locked, say which section it changes **and add it to the Pending
Amendments table in the same turn.** "Without the table, corrections live in
chat and reach the document only by accident."

## Reissues run once

Where several sections invalidate the same beats, hold the reissue until all of
them are resolved and run **one pass, not two**.

## A change to the document is a version cut

E10's doc-lint runs before any cut ships and "a cut failing lint does not ship":
`npm run standards:lint`. The current baseline is 24 errors / 34 warnings — those
are real findings in the document, catalogued in `docs/doc-lint-findings.md`, not
parser bugs. Do not let that baseline grow.
