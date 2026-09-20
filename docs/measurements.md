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

---

## M4 — Sunburst verifies clean; `nano_banana_pro` aliases again *(measured 20 Sep 2026)*

§18A calls GPT Image 2.5 Sunburst a *"sanctioned challenger to
`nano_banana_pro`"* on typed beats, and sets the bar: it becomes the default
*"only when the first side-by-side holds both the wordmark **and** the
§22A/§22T register."* This is that side-by-side — one prompt, two models,
submitted in a single batch.

**The beat.** A hero product beat on a real domestic surface (§15A), carrying
a readable invented wordmark, `FLEXNOVA`, in flat white capitals. Assembled
from the library: `CAM-LOCK` → product prose → `SURF-PATTERN` →
`CAP-A` → `CAP-FILE` → `NEG-SURF` + `NEG-M1`. 3,482 characters minified.
`REF-PROD` was deliberately left out — it opens *"exactly as in the attached
reference image"* and no reference exists for a synthetic test.

| | index 0 | index 1 |
|---|---|---|
| Passed | `gpt_image_2_5`, `variant: sunburst` | `nano_banana_pro` |
| **Logged model** | **`gpt_image_2_5`** ✓ | **`nano_banana_2`** ✗ |
| Logged `params.model` | **`sunburst`** ✓ | — |
| Job | `4be05fec-a8a8-40ee-8c9f-b7ddf6731a09` | `73c958a3-7e1b-4aca-92ce-21ad923b81e8` |
| Output | 1520×2688 | 1536×2752 |
| Cost | 3 credits | 2 credits |

**Two findings, both about routing rather than pixels.**

First, **the GPT Image route verifies cleanly through this connector.** The
passed model is the logged model, and the job's own params confirm
`sunburst` — so §18A rule 1's trap (an omitted variant silently running
retired Flare) is not firing when the variant is passed explicitly, and
`verifyLoggedModel()` accepts the job.

Second, **M1's alias failure reproduced independently.** A second
`nano_banana_pro` submission, on a different prompt in a different batch,
again completed logging `nano_banana_2`. Two for two. This is no longer a
one-off worth re-running — it is the behaviour of the route.

**What is NOT settled here.** Whether the wordmark actually rendered legibly.
The generated files sit behind a CDN this environment's egress policy blocks,
and no Anthropic credential is configured here, so neither a direct look nor
an automated vision check was possible. §42's rule applies: objective findings
first, subjective read second, and say which is which. The model-verification
result above is measured. The wordmark verdict is **outstanding and belongs to
a human eye.**

**So the wordmark route is unchanged for now.** §18A sets a two-part bar — the
wordmark *and* the register — and only the half that does not need eyes has
been cleared. What the model evidence does establish is that if the wordmark
holds, Sunburst is the route with no verification cost, and `nano_banana_pro`
is not usable here regardless of how its frame looks.
