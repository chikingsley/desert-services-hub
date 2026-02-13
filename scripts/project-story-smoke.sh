#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD="$ROOT_DIR/scripts/project-story.sh"

if [[ ! -x "$CMD" ]]; then
  echo "Missing executable: $CMD" >&2
  exit 1
fi

extract_json() {
  sed -n '/^{/,$p'
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "[FAIL] $label: expected=$expected actual=$actual" >&2
    return 1
  fi
  echo "[PASS] $label: $actual"
}

assert_ge() {
  local actual="$1"
  local min="$2"
  local label="$3"
  if (( actual < min )); then
    echo "[FAIL] $label: expected >= $min actual=$actual" >&2
    return 1
  fi
  echo "[PASS] $label: $actual"
}

run_case() {
  local label="$1"
  shift
  echo >&2
  echo "== $label ==" >&2
  "$CMD" "$@" | extract_json
}

tmp1="$(mktemp)"
tmp2="$(mktemp)"
tmp3="$(mktemp)"
tmp4="$(mktemp)"
trap 'rm -f "$tmp1" "$tmp2" "$tmp3" "$tmp4"' EXIT

run_case "Subject Resolve" \
  --subject "FW: DPX8 - Site Surrender Project" \
  --since 2026-02-01 \
  --timeline-limit 4 >"$tmp1"

run_case "Email Resolve" \
  --email-id 820833 \
  --since 2026-02-01 \
  --timeline-limit 4 >"$tmp2"

run_case "Project Resolve" \
  --project-id 103 \
  --since 2026-02-01 \
  --timeline-limit 4 >"$tmp3"

run_case "Negative Query" \
  --query "totally-made-up-project-zzzz" \
  --since 2026-02-01 \
  --timeline-limit 4 >"$tmp4"

subject_project_id="$(jq -r '.resolution.resolvedProjectId // "null"' "$tmp1")"
subject_score="$(jq -r '.resolution.projectMatchScore // 0' "$tmp1")"
email_project_id="$(jq -r '.resolution.resolvedProjectId // "null"' "$tmp2")"
project_project_id="$(jq -r '.resolution.resolvedProjectId // "null"' "$tmp3")"
negative_project_id="$(jq -r '.resolution.resolvedProjectId // "null"' "$tmp4")"
negative_story_rows="$(jq -r '.counts.story_rows_total // -1' "$tmp4")"

assert_eq "$subject_project_id" "103" "subject resolved project_id"
assert_ge "$subject_score" 250 "subject score floor"
assert_eq "$email_project_id" "103" "email resolved project_id"
assert_eq "$project_project_id" "103" "project-id resolved project_id"
assert_eq "$negative_project_id" "null" "negative query unresolved"
assert_eq "$negative_story_rows" "0" "negative query empty story"

echo
echo "== Latency (subject case, 10 runs) =="
for _ in $(seq 1 10); do
  start_ms="$(date +%s%3N)"
  "$CMD" --subject "FW: DPX8 - Site Surrender Project" --since 2026-02-01 --timeline-limit 4 >/dev/null
  end_ms="$(date +%s%3N)"
  echo $((end_ms - start_ms))
done | awk '
BEGIN { min=1e9; max=0; sum=0; n=0 }
{
  v=$1;
  if (v < min) min=v;
  if (v > max) max=v;
  sum += v;
  n += 1;
  vals[n]=v;
}
END {
  asort(vals);
  p50=vals[int((n+1)/2)];
  p95=vals[int((n*95+99)/100)];
  printf("runs=%d avg_ms=%.1f min_ms=%d p50_ms=%d p95_ms=%d max_ms=%d\n", n, sum/n, min, p50, p95, max);
}'

echo
echo "Smoke test passed."
