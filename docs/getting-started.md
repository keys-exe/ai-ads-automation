# Getting started

No technical background assumed. Three things to do once, then one command per
build.

## 1. Install

```bash
npm install
```

You also need three command-line tools for step 1: **ffmpeg**, **tesseract**
and **whisper**. §42 Part 1 measures the reference video with real instruments
before anything is interpreted — "a label is not a measurement" — so without
them step 1 stops and names the one that is missing rather than guessing.

On a Mac: `brew install ffmpeg tesseract && pip install openai-whisper`.
Or build the image that has all three:
`docker build -f docker/instruments.Dockerfile -t ai-ads .`

## 2. Add your keys

```bash
cp .env.example .env
```

Fill in two to start:

- **`ANTHROPIC_API_KEY`** — every step is a model call. Key from
  console.anthropic.com.
- **`HIGGSFIELD_MCP_URL`** and **`HIGGSFIELD_MCP_TOKEN`** — image generation,
  needed from step 3 onward.

The ElevenLabs, HeyGen and Kling entries are for the voice, avatar and video
routes, which are not wired yet. Leave them blank.

Then check:

```bash
npm run ready
```

It lists what is missing, what each missing thing blocks, and what to do about
it. Nothing else will make more sense until this is clean.

## 3. Make a build

Create a folder and put everything in it. One drop, mixed files, no form.

```bash
mkdir -p builds/my-ad/inbox
cp ~/Downloads/reference-ad.mp4  builds/my-ad/inbox/
cp ~/Downloads/script.md         builds/my-ad/inbox/
cp ~/Downloads/product-sheet.md  builds/my-ad/inbox/
cp ~/Downloads/hero.jpg          builds/my-ad/inbox/
mkdir -p builds/my-ad/inbox/placement
cp ~/Downloads/on-wrist.jpg      builds/my-ad/inbox/placement/
```

**Only the script is required.** The Product Sheet is created if you do not
supply one. The placement folder is optional — but with no worn-placement
reference, §9D blocks REVEAL beats until you add one, and the run says so.

Then:

```bash
npm run build:run -- my-ad
```

It classifies the folder, prints what it found, and runs steps 1 through 5
without stopping. If it cannot place a file it says which and why, and stops —
rename the file, or list it in `builds/my-ad/inbox/bundle.json`.

### Rehearse it first

```bash
npm run build:run -- my-ad --no-generate
```

Every generation call is assembled and printed with its model and parameters,
and none is submitted — so you can see the shape of the build before spending
image credits. The model calls still run; this rehearses the generation spend,
not the whole build.

## 4. Look at what came out

```bash
npm run build:status -- my-ad     # counts, locks, what needs a human
npm run deliver     -- my-ad      # then open the file it prints
```

`deliver` writes a set of HTML pages to `builds/my-ad/deliveries/`. Open
`index.html` from disk — they are ordinary files and work with no internet.

## What it costs

Step 1 and step 2 are model calls only. **Step 3 is the first step that spends
image credits** — it generates a reference sheet for everyone who appears in two
or more beats. Step 4 generates one property plate per dwelling and one scene
plate per PLATED location. Volume depends on your script.

## What it does not do yet

Steps 6, 7 and 8 — the hooks gate, B-roll and body acts, and the CapCut block.
Those are the steps that produce the finished beats and the edit. The voice and
avatar route is written but not wired in.

So today you get: the absorption of your reference, the locks, the cast with
their sheets, the property and locations with their plates, and the act map with
its coverage ledger. Not a finished video.

## If something goes wrong

Every failure is reported in plain language with the fix attached. The build
records where it stopped, so fix the cause and resume:

```bash
npm run build:run -- my-ad --from 3
```

Nothing is recomputed that already succeeded.
