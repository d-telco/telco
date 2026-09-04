#!/usr/bin/env bash
# Every check this repository has, in the order that fails fastest.
#
# Four came first: the browser suite that refuses Dengage, the everything works
# census, the phone check and the email renderer. Six more grew alongside them: the contract
# check, the coverage check, the Android source rules, the backend assertions, the feed comparison
# and the page build's own checks. None of them
# writes into the Dengage account, and the two that touch the network only read.
#
# The pipe matters. This file used to read `node tools/verify.mjs | tail -1`, and a pipeline's
# status is its last command's, so a suite that failed 1 of 116 exited 0 and printed a summary line
# that looked fine. A check nobody can fail is not a check. Every run below is captured whole, its
# status is the run's own, and a failure prints the assertions that failed rather than the tail.
set -u

FAILED=0
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

run () {
  local name="$1"; shift
  echo; echo "=== $name ==="
  if "$@" > "$OUT" 2>&1; then
    tail -2 "$OUT"
  else
    grep -E '^\s*FAIL' "$OUT" | head -20
    tail -2 "$OUT"
    echo "--- $name failed ---"
    FAILED=1
  fi
}

echo "=== build ==="
python3 tools/build-catalogue.py >/dev/null 2>&1 || true
run "pages"         python3 tools/build-pages.py
run "contract"      node tools/check-contract.mjs
run "slot runbook"  node tools/build-slot-runbook.mjs --check
run "coverage"      node tools/check-coverage.mjs
run "census"        node tools/audit.mjs
run "browser suite" node tools/verify.mjs
run "phone"         node tools/mobile-check.mjs
run "emails"        node tools/preview-emails.mjs
run "android"       node tools/check-android.mjs
run "backend"       node tools/check-backend.mjs
run "functions"     node tools/check-functions.mjs
run "personas"      node tools/check-personas.mjs
run "feed"          node tools/check-feed.mjs

echo
if [ "$FAILED" -eq 0 ]; then echo "every check passed"; else echo "SOMETHING FAILED, see above"; fi
exit "$FAILED"
