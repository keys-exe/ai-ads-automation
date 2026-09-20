# The voice + avatar talking-head route

A second production route for talking heads, alongside the standards'
Kling-native one. Kling generates two short clips of the presenter; those
clips seed both a cloned voice and an avatar identity; the script is reduced
to what is spoken, synthesised in that voice, scored, chosen, split, and
rendered as lip-synced parts.

```
source clips (2 × ~10s) ──┬── audio ──▶ ElevenLabs IVC ──▶ cloned voice
                          └── video ──▶ HeyGen Avatar V identity

script ──▶ cleaned to spoken lines ──▶ N takes ──▶ scored ──▶ [you choose]
                                                                  │
                                            split 3–4 parts ◀─────┘
                                                  │
                                    Avatar V render per part
```

## Why the clips do double duty

Avatar V learns identity from a **short video**, processed as a full context
window, and holds it across angles and duration. It is not a photo-to-video
engine — that is Avatar IV. ElevenLabs' Instant Voice Clone, meanwhile, takes
**audio samples**, not video.

So one pair of ten-second clips satisfies both: the track is extracted for the
clone, the clip itself is the avatar identity. That extraction is a
precondition, not a convenience — uploading a video file to the clone endpoint
is the most likely way for that call to fail, and it would fail after the
upload rather than before it.

## How this sits with the standards

**It overrides §44.7.** That default locks the voice source to *"the generated
voice, on any build with an on-camera presenter,"* restricting third-party TTS
to pure-VO builds. This route uses ElevenLabs TTS for on-camera talking heads.

The override looks correct rather than merely convenient. §22C's one-voice
rule exists because of lip-sync — *"No mouth, no conform"* — and HeyGen
conforms lips to supplied audio, which dissolves the constraint the rule was
written around. Three consequences follow:

- **§22D's convergence failure stops applying.** The observed failure was that
  every generated talking head returns the same default voice regardless of
  what the roster says. A cloned voice is an id, not a prose description, so
  there is nothing to converge toward.
- **Most of §28H's sync discipline stops applying.** The word budget and sync
  triage exist because generated lips drift from generated audio. Conformed
  lips do not.
- **§30E Part 4's identity problem softens.** Avatar V holds one identity
  across parts by construction.

What does **not** change: §43A's claims pass, §27B's coverage, §17's
post-production boundary, and the rule that the script is absorbed as written.
The cleaning step subtracts; it never rewrites.

## The one human gate

Take selection. Several takes are synthesised and each is scored on
instruments the standards already define:

| Check | Threshold | Source |
|---|---|---|
| Entry latency | ≤ 0.5s to the first word | §28G, E1 |
| Longest internal gap | ≤ 0.4s between phrases | E1 |
| Words per minute | over spoken time, not wall time | E6 |
| Loudness range | normalised-hot vs dynamic | §22D |

The scorer **ranks; it does not choose.** Voice quality is the kind of
judgement a number can order but not settle, and every render downstream
inherits the choice. The numbers travel with the shortlist, per §45.

## Splitting

Deterministic, not model-driven — the split decides where a cut lands in the
finished ad, and "split this sensibly" gives a different answer each run.
Three constraints in priority order:

1. **Never split mid-sentence.** §29 makes a segment a whole thought.
2. **Stay under Eleven v3's 3,000-character ceiling.** A hard API gate that
   can force more parts than the 3–4 requested. It wins.
3. **Balance the parts** as far as sentence boundaries allow.

An ellipsis is treated as a pause rather than a terminator unless what follows
reads as a new sentence — in ad copy *"Then nothing… for three years"* is one
thought, and splitting it is the exact failure rule 1 prevents.

## ⚠️ The three adapters are unverified

`src/providers/{elevenlabs,heygen,kling}.ts` were written **without access to
the live APIs**: this environment's egress policy blocks `api.elevenlabs.io`,
`api.heygen.com` and `api.klingai.com`, so their request shapes come from the
providers' published references as surfaced by search, not from the docs and
not from a call that ran.

Each file carries a banner and an `ENDPOINTS` constant so verification is one
place per provider. **Check them before the first real run.**

What is established rather than assumed:

- `eleven_v3` is the model id, and it caps at 3,000 characters per request.
- IVC takes audio; MP3 at 192kbps or above is recommended, and uncompressed
  WAV can cause upload problems.
- Avatar V is selected with `engine.type: "avatar_v"` and learns from video.
- Avatar IV is the photo engine, at `/v2/video/av4/generate`.

Everything outside those three files — extraction, scoring, cleaning,
splitting, orchestration, storage — is verified and tested here, and does not
depend on the adapters being right.
