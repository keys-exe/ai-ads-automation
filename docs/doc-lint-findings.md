# Doc-lint findings — Standards V7.51.3

Produced by `npm run standards:lint`, which implements the computable subset of
Appendix E10. Recorded here because E10 makes these a gate on a version cut:
"A cut failing lint does not ship."

**24 errors, 34 warnings.** Every error is one check: the declared character
count on an Appendix A string does not match the block beneath it.

## The count drift clusters in two sections

Of 177 strings carrying a declared count, 151 match exactly. The 26 that do not
are almost entirely in two places:

| Section | Strings mismatched | Of |
|---|---|---|
| §22E Fixed mount / CCTV | 15 | 15 |
| §27E Material failure | 8 | 9 |
| Elsewhere (`CAP-C`, `NEG-PHYS`, `RIG-R7` cross-listing) | 3 | — |

Both clusters are the document's newest normative sections — §22E was added at
V7.48.7 and split at V7.48.10; §27E is new at V7.48.9. The pattern is
consistent with the blocks being edited after their counts were printed, which
is exactly the drift E10's check exists to catch.

The deltas are not rounding. `NEG-BREAK` declares 619 and measures 521 (−98);
`NEG-CCTV` declares 735 and measures 656 (−79); `BREAK-GLASS` declares 520 and
measures 458 (−62). Several run the other way — `CAM-CCTV` declares 348 and
measures 362 (+14).

This matters beyond tidiness. §37's trim ladders and the Kling 2,500-character
ceiling are both arithmetic over these counts. A beat assembled from `NEG-CCTV`
+ `CAM-CCTV` + `CAP-CCTV` budgets 1,696 characters against a true 1,632 — the
error is in the safe direction there, but `CAM-CCTV` alone runs 14 over its
declared figure, and the ceiling is a hard reject.

## Two findings that are not defects

**`RIG-R7` is defined twice**, under both *Fixed mount* and *Rigs*. The blocks
are byte-identical, so this is a deliberate cross-listing rather than a
conflict. The registry dedupes by id; lint reports it as a warning.

**63 strings carry no declared count.** 36 of those contain a `[SLOT]` token
filled per build from the Product Sheet (E5), so a fixed count is meaningless
for them and its absence is correct. The remaining 27 have neither a count nor
a slot to excuse it, and are reported as warnings.

A further 36 strings *do* carry a count while also carrying a slot token. Their
printed number is the unfilled length, so lint reports drift on those as a
warning rather than an error.

## What lint does not check

E10's remaining items need a live build rather than the document: job ids in
the ledger resolving to beat ids, a delivered batch's manifest matching its
payload order (§16B), every act-map row carrying a `story_day` and a
`capture_event_id`, every location row resolving to a `dwelling_id` or an
explicit null, and the project-instructions byte-match. Those belong with the
run ledger and arrive with the steps that produce one.
