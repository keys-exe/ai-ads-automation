# Deploying to Railway

Three services from this one repo, plus a managed database and an object
store. Railway builds each service from its own Dockerfile and config file.

```
Postgres (Railway managed)
   │
   ├── web     ← Dockerfile              · serves the UI, enqueues work
   └── worker  ← docker/worker.Dockerfile · runs jobs, runs migrations
                                           ffmpeg · tesseract · Whisper
        │
    R2 / S3 bucket ← the upload bundle, shared by both
```

## Object storage is required here, not optional

Railway **does not support mounting one volume to two services**, and has said
it is not planning to. The web service writes the upload bundle and the worker
reads it back, so on Railway they cannot share a disk — storage has to be an
object store.

**Use Railway's own Storage Bucket.** It is S3-compatible and it injects its
credentials as `AWS_*` variables, which this app reads directly — so attaching
one needs no variable mapping at all. Cloudflare R2, AWS S3, Backblaze and
MinIO all work too, through the `S3_*` names.

Attaching a bucket is what switches the app from the filesystem driver to the
object store. Nothing else changes.

## Setup

### 1. Postgres

Add a **Postgres** database to the project. Railway exposes its connection
string as a reference variable you use from the other services:
`${{Postgres.DATABASE_URL}}`.

The app and pg-boss share this one database — the queue lives in a `pgboss`
schema alongside the application tables.

### 2. A bucket

**+ New → Bucket.** Then attach it to **both** the web and worker services so
each gets the credentials. Nothing else to configure — the app reads the
`AWS_*` variables Railway injects.

If you would rather use Cloudflare R2 or AWS S3, set the `S3_*` variables
instead; those take precedence.

### 3. Two services from this repo

Add the repo twice, once per service. For each, set **Config-as-code file** in
service settings:

| Service | Config file |
|---|---|
| `web` | `railway.web.json` |
| `worker` | `railway.worker.json` |

That file carries the Dockerfile path, start command and health check, so
there is nothing else to configure on the build side.

### 4. Variables

Both services need the same values. Two of them are non-negotiable:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Identical on BOTH services, and stable forever. It decrypts the provider
# credentials stored in Settings; change it and every connection becomes
# unreadable and has to be re-entered.
#   openssl rand -base64 32
SETTINGS_ENCRYPTION_KEY=<the same value on web and worker>

# Storage: nothing to set if you attached a Railway Bucket — it injects its
# own AWS_* variables and the app reads them. Only needed for R2 / AWS / MinIO:
#   S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
```

Worker only:

```bash
WHISPER_MODEL=small     # tiny | base | small | medium | large
TTS_TAKE_COUNT=3
```

Do **not** set `PORT` on the web service. Railway injects it and the server
binds whatever it is given.

Provider credentials — Anthropic, Higgsfield, Kling, ElevenLabs, HeyGen — are
connected in `/settings` once the app is up, not set here.

### 5. Deploy the worker first

Migrations run as the worker's pre-deploy command, because the worker image
carries `tsx` and the migration scripts while the web image is a slim
standalone build that does not.

On a first deploy that ordering matters: the web service will error on every
query until the tables exist. Afterwards the order is irrelevant — migrations
are idempotent and re-run harmlessly on each worker deploy.

### 6. Create the first account

From the worker service shell:

```bash
npx tsx scripts/create-user.ts you@example.com "Your Name" <password>
```

Then open the web service's URL, sign in, and go to `/settings`.

## Checking it worked

`GET /api/health` on the web service reports the three things that break a
deployment quietly:

```json
{
  "ok": true,
  "checks": {
    "database":   { "ok": true, "detail": "reachable" },
    "standards":  { "ok": true, "detail": "V7.51.3 · 486 sections · 240 strings" },
    "encryption": { "ok": true, "detail": "SETTINGS_ENCRYPTION_KEY is set" }
  }
}
```

Railway uses this as the web service's health check, so a failing database or
a missing encryption key shows up as a failed deploy rather than a broken page.

## The worker image is large

3–4 GB, almost entirely Whisper weights and torch. Two consequences:

- **First build is slow** — expect ten minutes or more.
- **It may exceed image limits on smaller plans.** `WHISPER_MODEL=tiny` cuts
  it substantially and is worth trying first if a build fails on size; the
  transcript quality drop only affects §42 Part 4.

The web image is small and ordinary by comparison.

## After it is up

1. `/settings` → connect all five providers → **Test each one**. Every test is
   a real read-only call and costs nothing.
2. A build through steps 1–2. Anthropic and the instruments only, no
   generation credits spent.
3. Step 3 — the first credits, and the first exercise of the Higgsfield
   adapter.
4. A voice route job — this is what exercises the three unverified adapters
   (`docs/voice-route.md`). Expect to correct request shapes here.

## Scaling

Raise the worker's replica count. pg-boss hands each job to one worker and
every step claims its row with a conditional update, so duplicate delivery is
already handled. With object storage there is no volume to contend over.
