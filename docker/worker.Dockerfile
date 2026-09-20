# The worker image.
#
# Separate from the web image because §42 Part 1 runs real instruments and they
# are the only reason this container is heavy. The web process needs none of
# them: it queues work and reads results.
FROM node:22-bookworm-slim

# ffmpeg  — instruments 1-5: probe, scene detection, silence, volume, luminance
# tesseract — instrument 6: the text-overlay inventory
# python3/pip — Whisper, for the Part 4 transcript
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

COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx typescript

COPY . .

# Pre-download the Whisper weights at build time rather than on the first job,
# so a first run is not a silent ten-minute model fetch.
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python3 -c "import whisper; whisper.load_model('${WHISPER_MODEL}')" || true

ENV NODE_ENV=production
CMD ["npx", "tsx", "src/worker/index.ts"]
