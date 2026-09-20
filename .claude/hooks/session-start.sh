#!/usr/bin/env bash
# What is missing, and what is in flight — answered before the first question.
#
# §42 Part 1's instruments are the usual surprise: without ffmpeg, tesseract and
# whisper on PATH, step 1 fails by name rather than falling back to an estimate,
# and it is better to know that now than four minutes into a build.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

[ -d node_modules ] || { echo "node_modules is absent — run npm install before any build."; exit 0; }

npm run --silent ready 2>&1 | grep -E '^(✗|·)' | head -12
npm run --silent build:status 2>&1 | head -12
exit 0
