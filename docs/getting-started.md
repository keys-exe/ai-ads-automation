# Getting started

No technical background needed. The app tells you what is missing and what to
do about it — this is the same thing in writing.

## The short version

1. Open **`/setup`**. It lists everything the pipeline needs and marks what is
   missing.
2. Fix whatever it says, in the order it says.
3. Make a build, upload your files, press the step buttons in order.

`/setup` always shows a **Do this next** box. If you only ever read one thing,
read that.

## What the five connections are for

You connect these once, in **Settings**. Each has a **Test** button that makes
a free, read-only call so you know it works before you rely on it.

| | What it does | Needed for |
|---|---|---|
| **Anthropic** | The thinking behind every step | **Everything** |
| **Higgsfield** | Generates images | Steps 3 and 4 |
| **ElevenLabs** | Clones a voice, speaks the script | The voice route |
| **HeyGen** | Makes the talking-head videos | The voice route |
| **Kling** | Video generation | Nothing yet — safe to connect early |

Anthropic is the one people miss, because it is not a media company. Without
it nothing runs at all.

## What each step costs

Shown on every button before you press it. Roughly, per build:

| Step | Cost |
|---|---|
| 1 — absorb the reference video | ~$0.30, no image credits |
| 2 — absorb the script | ~$0.30, no image credits |
| 3 — cast the characters | Anthropic + Higgsfield credits |
| 4 — property and locations | Anthropic + Higgsfield credits |
| 5 — act map and wardrobe | ~$0.25, no image credits |
| Voice route | ElevenLabs + HeyGen, **the expensive part** |

**Steps 1 and 2 cost about sixty cents and spend no image or video credits.**
Run those first on any new deployment: they prove the whole thing works —
uploads, the database, the video tools, the model — before anything expensive
happens.

The genuinely expensive part is HeyGen, at roughly $4–5 per minute of finished
video. A 60–90 second ad is about $5–8 in avatar renders, which is several
times the cost of everything else put together.

## Doing a build

1. **Builds → Create build.** Give it a name.
2. **Upload the bundle.** Five boxes, filled once:
   - **Inspo video** — the ad you want to beat. File or a link.
   - **Script** — what the presenter says.
   - **Product** — photos of the product.
   - **Product Sheet** — optional. Written for you if you do not have one.
   - **Product placement** — optional. A photo of the product being worn.
3. **Press the steps in order.** 1, then 2, then 3. Steps 4 and 5 start
   themselves once 3 finishes.

You can leave the page. Work carries on in the background and the page picks
up where it left off.

## When something fails

The failure is shown as a sentence and a fix, not an error code. For example:

> **Anthropic is not connected, and every step needs it.**
> Open Settings and connect Anthropic with an API key from console.anthropic.com.

The original technical message is still there under **Technical detail** if
you want it, or want to send it to someone.

## The things that actually go wrong

**"Not ready yet" on the Builds page.** Something required is not connected.
Open `/setup`; it names it.

**A step sits at "queued" and never moves.** The worker is not running. On
Railway, check the worker service is deployed and has not crashed.

**"A provider rejected the API key."** The key is wrong, expired, or was
copied with a space. Make a new one and re-save it.

**"The provider account has run out of credit."** Nothing is broken — top up
with that provider and press the step again.
