# The web image.
#
# Small on purpose. It serves the UI and enqueues work; it never runs an
# instrument, so it needs none of ffmpeg, tesseract or Whisper. Those live in
# docker/worker.Dockerfile, which is why the two are built separately rather
# than from one shared image.

# --- deps -------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The standards document is parsed at build time into the section store, and
# read from disk again at runtime — so it has to be present for both.
RUN npm run standards:lint || echo "doc-lint reported findings; see docs/doc-lint-findings.md"
RUN npx next build

# --- runtime ----------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output carries its own traced node_modules; static and public are
# not traced and must be copied alongside it.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# loadStandards() resolves against process.cwd() at runtime, so the document
# ships in the image rather than being baked into the bundle.
COPY --from=build --chown=nextjs:nodejs /app/standards ./standards

# The upload bundle lives here and is shared with the worker by volume.
RUN mkdir -p /app/storage && chown nextjs:nodejs /app/storage
ENV STORAGE_ROOT=/app/storage

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
