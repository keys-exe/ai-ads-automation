# The instrument image.
#
# Heavy on purpose: §42 Part 1 runs real instruments and they are the only
# reason this container is large. A few GB, mostly Whisper weights.
#
# Step 1 will not run without ffmpeg, tesseract and whisper on PATH — it fails
# by name rather than falling back to an estimate, because "a label is not a
# measurement". Use this image, or install the three locally; `npm run ready`
# tells you which are missing.
FROM node:22-bookworm-slim

# ffmpeg    — instruments 1-5 (probe, scenes, silence, volume, luminance) and
#             the audio extraction the voice route depends on (Phase 2)
# tesseract — instrument 6, the text-overlay inventory
# python3   — Whisper, for the Part 4 transcript
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      tesseract-ocr \
      tesseract-ocr-eng \
      python3 \
      python3-pip \
      python3-venv \
      ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Whisper in its own venv so pip never fights the system python.
RUN python3 -m venv /opt/whisper \
 && /opt/whisper/bin/pip install --no-cache-dir openai-whisper \
 && ln -s /opt/whisper/bin/whisper /usr/local/bin/whisper

WORKDIR /app

# tsx is a runtime dependency here, not a dev tool: the worker executes
# TypeScript directly rather than being compiled.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Pre-download the Whisper weights at build time rather than on the first job,
# so a first run is not a silent ten-minute model fetch.
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
# Use the VENV's python, not the system one: whisper is installed in
# /opt/whisper and `python3 -c "import whisper"` would always fail. It was
# masked by a `|| true`, so the build passed and the weights were never
# fetched — leaving the first transcription to download them mid-job.
RUN /opt/whisper/bin/python -c "import whisper; whisper.load_model('${WHISPER_MODEL}')"

ENV NODE_ENV=production
ENV BUILDS_ROOT=/app/builds
RUN mkdir -p /app/builds

# No long-running process: a build is a command. Mount your builds directory
# and run one.
#
#   docker build -f docker/instruments.Dockerfile -t ai-ads .
#   docker run --rm --env-file .env -v "$PWD/builds:/app/builds" ai-ads \
#     npm run build:run -- <slug>
CMD ["npm", "run", "ready"]
