# Deploying

Three processes and a database: Postgres, the web app, and the worker. The
compose file brings all of it up; nothing here is host-specific, so it runs on
a plain VM and is the base for Fly, Render or Railway.

## Vercel will not run this

Worth stating plainly, because the repo is a Next.js app and Vercel is the
reflex. It can host the web half and nothing else:

| Needs | Vercel |
|---|---|
| A long-lived worker polling pg-boss, running jobs for minutes | No — functions are per-request |
| A persistent filesystem shared with the web process | No — ephemeral `/tmp` only |
| ffmpeg, tesseract, Whisper | No system binaries |
| Minutes-long execution | Function timeouts |

A Vercel deployment therefore produces a **working UI where nothing ever
runs** — every step sits at `queued` forever. That is worse than a failed
build, because it looks like it succeeded.

If you want to keep Vercel for the web app, that is a legitimate split, but
be clear about the cost: the worker still needs a container host somewhere,
**and** storage has to move to S3 (below) because the two halves no longer
share a disk. Keeping Vercel adds a host; it does not remove one.

## Storage: volume or object store

| Deployment | Driver | Configure |
|---|---|---|
| One host, web + worker together | filesystem | `STORAGE_ROOT` (default) |
| Split across hosts | S3-compatible | `S3_BUCKET` and friends |

Setting `S3_BUCKET` switches the driver. Everything else is unchanged —
uploads, instruments and provider calls go through the same interface either
way. Works with AWS, Cloudflare R2, Backblaze B2 and MinIO.

The one thing to know: ffmpeg, tesseract and Whisper take a file path, not
bytes. On the S3 driver an asset is downloaded to a temp file before any
instrument touches it, and the pipeline cleans those up in a `finally`.

## Quick start

```bash
cp .env.docker.example .env

# Both are required. The stack refuses to start without them.
openssl rand -base64 32            # → SETTINGS_ENCRYPTION_KEY
                                   # → POSTGRES_PASSWORD (any strong value)

docker compose up -d --build
docker compose exec web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(o=>console.log(JSON.stringify(o,null,2)))"
```

Then create the first account and sign in:

```bash
docker compose run --rm worker npx tsx scripts/create-user.ts you@example.com "Your Name" <password>
```

`/api/health` reports the three things that break a deployment quietly: the
database being unreachable, the standards document missing from the image, and
the encryption key being unset.

## What each piece needs

| | Needs | Size |
|---|---|---|
| **postgres** | A volume. Shared with pg-boss — the queue lives in a `pgboss` schema in the same database | small |
| **web** | Node 22. No instruments: it serves the UI and enqueues work | small |
| **worker** | Node 22 **plus ffmpeg, tesseract and Whisper** | **~3–4 GB** |

The worker is large because §42 Part 1 runs real instruments. That is the
whole reason the two images are built separately rather than from one shared
base — there is no sense shipping Whisper weights to the process that serves
HTML.

Build time for the worker is dominated by the Whisper download. `WHISPER_MODEL`
controls it: `tiny` builds in a couple of minutes, `small` is the default and
the sensible balance, `medium` and `large` are considerably bigger.

## Two things that break deployments quietly

**web and worker must share the storage volume.** The web process writes the
upload bundle to `STORAGE_ROOT`; the worker reads those files back by path. On
separate volumes every job fails on a missing file the UI insists it uploaded.
The compose file mounts one named volume into both at the same path — keep
that property if you split them across hosts, which on a multi-host deployment
means shared storage (NFS, EFS) or moving to object storage.

**`SETTINGS_ENCRYPTION_KEY` must be stable across restarts and identical on
web and worker.** It decrypts stored provider credentials. Change it and every
connection in Settings becomes unreadable — not corrupted, just undecryptable,
and they have to be re-entered. Back it up where you back up the database.

## Egress

The pipeline calls out to Anthropic, Higgsfield, ElevenLabs, HeyGen and Kling.
A deployment behind a restrictive egress policy will fail at the first
provider call with a connection error rather than an auth error, which is a
confusing way to discover the problem. Confirm outbound HTTPS to those hosts
before the first run.

## First run, in order

1. `docker compose up -d --build`, then check `/api/health` is `ok: true`.
2. Create a user and sign in.
3. **Open `/settings` and connect all five providers, then hit Test on each.**
   Every test is a real read-only call and costs nothing. This validates auth
   across the board in about two minutes.
4. Create a build, upload a bundle, run steps 1 and 2. These need only
   Anthropic and the instruments — no generation credits are spent.
5. Run step 3. This is the first step that spends credits and the first that
   exercises the Higgsfield adapter.
6. Run a voice route job. **This is what exercises the three unverified
   adapters** (`docs/voice-route.md`). Expect to fix request shapes here;
   that is the point of doing it early and on one job.

## Scaling the worker

`docker compose up -d --scale worker=3`. pg-boss hands each job to one worker,
and every step claims its row with a conditional update, so duplicate delivery
is already handled. The constraint is the shared storage volume, not the queue.

## Production notes

- Put TLS in front of the web service. It sets `secure` cookies when
  `NODE_ENV=production`, so sessions will not persist over plain HTTP.
- `POSTGRES_PORT` is published for convenience during setup. Close it once the
  stack is running.
- Back up the Postgres volume and `SETTINGS_ENCRYPTION_KEY` together. Either
  one alone is insufficient to restore.
