# Measured findings

§45: *"Measure before asserting. Where a claim about generation behaviour can
be tested, test it and report the number."* Each entry states what was run,
what came back, and what changed as a result.

---

## M1 — The model string does not reach the model *(measured 20 Sep 2026)*

**Reproduces §5's unresolved V7.42 finding on this pipeline's first real call.**

| | |
|---|---|
| Call | `generate_image` via the Higgsfield MCP connector |
| Passed | `model: "nano_banana_pro"`, `quality: high`, `resolution: 2k`, `aspect_ratio: 9:16` |
| Job | `4f176a90-8090-4df2-9fd6-d6af3da39af9` |
| **Logged** | **`nano_banana_2`** |
| Status | `completed` — 1536×2752, 2 credits |

§18A's model table already carries the hedge — of `nano_banana_pro`:
*"Measured — but see §5: the connector route has been delivering
`nano_banana_2`."* This is that, observed directly rather than inherited.

**What it means for the pipeline.** `verifyLoggedModel()` raises
`AliasMismatchError`, which E2 budgets at one retry before queueing for a
human. The guard behaves correctly. But any beat class routed to
`nano_banana_pro` through this connector will fail verification *every time*,
so the route is unusable here rather than merely unreliable.

**What changed.** `DEFAULT_ROUTES.property_plate` and
`DEFAULT_ROUTES.location_plate` moved from `nano_banana_pro` to
`nano_banana_2`. Re-reading §18A Part 3, this is also the more faithful route:
it names three classes for `nano_banana_pro` — readable wordmark, candid face
seeds, talking-head seeds — and a plate is none of them. An empty room with no
type and no face falls under *"Volume B-roll, no type → `nano_banana_2`"*.
`nano_banana_pro` for plates was this implementation's assumption, not the
standard's.

**Still open.** The three classes §18A genuinely does route to
`nano_banana_pro` — wordmark beats especially, where §4 says text rendering is
the one failure post cannot fix — remain exposed. §44.47's remedy stands:
model-critical work runs in the platform's own interface until the routing is
fixed. Nothing in this pipeline should claim a `nano_banana_pro` render
through the connector.

---

## M2 — Prompt assembly holds at length *(measured 20 Sep 2026)*

The §30G property plate assembled from locked strings measured **4,570
characters** minified and was accepted without truncation. Kling's 2,500
ceiling (§4) is a video-JSON limit and does not apply to image prompts.

The assembled prompt reproduced every never-trimmed clause: `CAP-FILE`'s
final sentence, `PROP-SHELL`'s one-standard-of-upkeep clause, and the
`NEGATIVES:` line carrying `NEG-PROP` + `NEG-SCENE` + `NEG-M1` merged.

---

## M3 — `[TYPE AND ERA]` is a noun phrase, not a sentence *(fixed 20 Sep 2026)*

Appendix B field 1 reads *"what kind of house and roughly what decade it was
built, in one sentence"*, which invites a fill ending in the word "house".
`PLATE-PROP` reads *"the hall of a [TYPE AND ERA] house"* and supplies it
already, so a sentence-shaped fill renders **"a 1930s semi-detached house
house"**.

Caught while assembling M1's prompt. `PropertySheet.typeAndEra`'s schema
description now states the constraint explicitly. The same class of error is
worth checking on any slot whose surrounding locked text continues the noun
phrase.
