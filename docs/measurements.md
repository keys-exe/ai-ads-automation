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

**The visual half, resolved by eye (20 Sep 2026).** Both frames were judged
good and realistic: the `FLEXNOVA` wordmark rendered legibly and the §22A/§22T
register held — it reads as a phone file, not as product photography. This
half is a **visual check** under §45's distinction, not an instrument reading;
it settles by looking, and someone looked.

That clears §18A's two-part bar for Sunburst on typed beats. **The route is
promoted.**

**What changed.** The three classes §18A puts on `nano_banana_pro` —
`readable_wordmark`, `candid_face_seed`, `talking_head_seed` — now route to
`gpt_image_2_5` Sunburst. This is a choice the standard already sanctions
rather than a deviation: Part 3 lists each of them as
*"`nano_banana_pro` · Sunburst"*, and §19's measured finding that Sunburst
returns *"the best close-up texture of any generation in the pipeline"* is the
supporting evidence for the two face classes.

Nothing now routes to `nano_banana_pro`. `UNUSABLE_ON_THIS_CONNECTOR` names
it, and a test asserts no default route lands on it, so the invariant is
enforced rather than remembered.

**One route that must not move.** §18A confines mechanism beats to
*"`nano_banana_2` · `nano_banana_pro` only — classifier threshold"*, and §4 is
explicit that OpenAI's classifiers are stricter than Nano Banana's. Sunburst
scoring well on a typed product beat says nothing about an anatomy beat, so
mechanism stays on `nano_banana_2` — the only remaining route — and §5's safe
vocabulary stays mandatory there. A test asserts this too.

**A side observation, n=1, unverified.** The control frame was judged good,
and that frame was rendered by `nano_banana_2` rather than the
`nano_banana_pro` requested. So `nano_banana_2` rendered an eight-character
wordmark acceptably once. That is interesting against §18A's placement of it
on *"volume B-roll, no type"*, but one frame is not a finding and nothing has
been routed on it.
