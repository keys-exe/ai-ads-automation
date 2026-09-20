#!/usr/bin/env bash
# E10: "Doc-lint — standing §34 step at every version cut ... A cut failing lint
# does not ship." This fires whenever the Standards document is edited, so a
# change that breaks the lint is caught in the turn that made it rather than at
# the next cut.
#
# Reads the PostToolUse payload on stdin and does nothing unless the edit
# touched standards/.
set -uo pipefail

payload=$(cat)
case "$payload" in
  *standards/*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

output=$(npm run --silent standards:lint 2>&1)
status=$?

if [ $status -ne 0 ]; then
  # Exit 2 puts the output in front of the model as feedback to act on.
  echo "standards doc-lint (E10) did not pass after this edit:" >&2
  echo "$output" | tail -30 >&2
  echo "Baseline before your change was 24 errors / 34 warnings (docs/doc-lint-findings.md). It must not grow." >&2
  exit 2
fi

echo "$output" | tail -3
exit 0
