---
description: Apply a §34 correction — global, retroactive, permanent, and into the document
argument-hint: <BEAT-ID> <what is wrong>
allowed-tools: Bash, Read, Edit, Grep, Skill
---

A correction to: `$ARGUMENTS`

Read `.claude/skills/ad-build/references/corrections.md` first, then follow §34
exactly:

1. Return **only** the corrected block, labelled with its beat ID, as a
   drop-in swap. Do not restate surrounding beats. Do not re-explain the system.
2. **Global** — grep `builds/<slug>/beats/` for the same flaw and fix it
   everywhere. Say in one line which other IDs were corrected. E9 built the tree
   so this is a scan, not a reconstruction.
3. **Retroactive** — name the already-delivered IDs that are now invalid and
   write `reissueFlag: { section, reason }` onto their ledger rows.
4. **Permanent** — never reintroduce the flaw in new work.
5. **Into the document** — say which section changes and add it to the Pending
   Amendments table in `standards/V7.51.3.md` in the same turn. A correction
   that stays in chat reaches the document only by accident.
6. Confirm in one line and stop.

**Reissues run once.** If several sections invalidate the same beats, hold the
reissue until all of them are resolved and run one pass, not two.

If you edited the document, run `npm run standards:lint` before you finish. E10:
a cut failing lint does not ship. The baseline is 24 errors / 34 warnings — it
must not grow.
