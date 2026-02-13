#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/project-story-replay.sh [--linked-limit <n>] [--unlinked-limit <n>] [--since <YYYY-MM-DD>] [--timeline-limit <n>] [--query-scope <subject|subject_meta|full>] [--thread-evidence-scope <strict|extended>] [--max-query-chars <n>] [--out-dir <dir>] [--label <name>]

Description:
  Replays project-story in shadow mode on real emails and reports deterministic
  resolver quality metrics.

  - Linked cases: uses one recent email per project and compares predicted
    project_id to existing linked project_id while simulating unlinked input.
  - Unlinked cases: measures unresolved/predicted behavior for currently
    unlinked emails.

Outputs:
  <out-dir>/<label>.cases.csv
  <out-dir>/<label>.summary.json
USAGE
}

LINKED_LIMIT="${LINKED_LIMIT:-20}"
UNLINKED_LIMIT="${UNLINKED_LIMIT:-20}"
SINCE="${SINCE:-2026-01-01}"
TIMELINE_LIMIT="${TIMELINE_LIMIT:-6}"
QUERY_SCOPE="${QUERY_SCOPE:-subject_meta}"
THREAD_EVIDENCE_SCOPE="${THREAD_EVIDENCE_SCOPE:-extended}"
MAX_QUERY_CHARS="${MAX_QUERY_CHARS:-1200}"
OUT_DIR="${OUT_DIR:-data/reports/project-story-replay}"
LABEL="${LABEL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --linked-limit)
      LINKED_LIMIT="${2:-}"
      shift 2
      ;;
    --unlinked-limit)
      UNLINKED_LIMIT="${2:-}"
      shift 2
      ;;
    --since)
      SINCE="${2:-}"
      shift 2
      ;;
    --timeline-limit)
      TIMELINE_LIMIT="${2:-}"
      shift 2
      ;;
    --query-scope)
      QUERY_SCOPE="${2:-}"
      shift 2
      ;;
    --max-query-chars)
      MAX_QUERY_CHARS="${2:-}"
      shift 2
      ;;
    --thread-evidence-scope)
      THREAD_EVIDENCE_SCOPE="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --label)
      LABEL="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

for v in LINKED_LIMIT UNLINKED_LIMIT TIMELINE_LIMIT MAX_QUERY_CHARS; do
  if [[ ! "${!v}" =~ ^[0-9]+$ ]]; then
    echo "--${v,,} must be numeric." >&2
    exit 1
  fi
done

case "$QUERY_SCOPE" in
  subject|subject_meta|full)
    ;;
  *)
    echo "--query-scope must be one of: subject, subject_meta, full" >&2
    exit 1
    ;;
esac

case "$THREAD_EVIDENCE_SCOPE" in
  strict|extended)
    ;;
  *)
    echo "--thread-evidence-scope must be one of: strict, extended" >&2
    exit 1
    ;;
esac

if [[ -z "$LABEL" ]]; then
  LABEL="$(date +%Y%m%d-%H%M%S)-${QUERY_SCOPE}-q${MAX_QUERY_CHARS}"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORY_CMD="$ROOT_DIR/scripts/project-story.sh"
DB_CONTAINER="supabase_db_desert-services-hub"

mkdir -p "$OUT_DIR"
CASES_CSV="$OUT_DIR/$LABEL.cases.csv"
SUMMARY_JSON="$OUT_DIR/$LABEL.summary.json"

tmp_linked="$(mktemp)"
tmp_unlinked="$(mktemp)"
trap 'rm -f "$tmp_linked" "$tmp_unlinked"' EXIT

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At -F $'\t' -c "
WITH ranked AS (
  SELECT
    e.id,
    e.project_id,
    e.received_at,
    ROW_NUMBER() OVER (PARTITION BY e.project_id ORDER BY e.received_at DESC) AS rn
  FROM emails e
  WHERE COALESCE(e.is_excluded, 0) = 0
    AND e.project_id IS NOT NULL
    AND e.received_at >= '${SINCE}'::timestamptz
)
SELECT id, project_id
FROM ranked
WHERE rn = 1
ORDER BY received_at DESC
LIMIT ${LINKED_LIMIT};
" >"$tmp_linked"

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -At -F $'\t' -c "
SELECT e.id
FROM emails e
WHERE COALESCE(e.is_excluded, 0) = 0
  AND e.project_id IS NULL
  AND e.received_at >= '${SINCE}'::timestamptz
  AND COALESCE(e.subject, '') <> ''
ORDER BY e.received_at DESC
LIMIT ${UNLINKED_LIMIT};
" >"$tmp_unlinked"

echo "case_type,email_id,expected_project_id,predicted_project_id,score,candidate_count,story_rows,linked_rows,unlinked_rows,runtime_ms" >"$CASES_CSV"

linked_total=0
linked_predicted=0
linked_match=0
linked_wrong=0
linked_unresolved=0
unlinked_total=0
unlinked_predicted=0

declare -A threshold_predicted
declare -A threshold_match
declare -A threshold_wrong
thresholds=(250 370 380 430 500)
for t in "${thresholds[@]}"; do
  threshold_predicted["$t"]=0
  threshold_match["$t"]=0
  threshold_wrong["$t"]=0
done

durations=()

run_case() {
  local case_type="$1"
  local email_id="$2"
  local expected_project_id="$3"

  local start_ms end_ms runtime_ms output json predicted_project_id score candidate_count story_rows linked_rows unlinked_rows
  start_ms="$(date +%s%3N)"
  output="$("$STORY_CMD" \
    --email-id "$email_id" \
    --since "$SINCE" \
    --timeline-limit "$TIMELINE_LIMIT" \
    --query-scope "$QUERY_SCOPE" \
    --thread-evidence-scope "$THREAD_EVIDENCE_SCOPE" \
    --max-query-chars "$MAX_QUERY_CHARS" \
    --simulate-unlinked)"
  end_ms="$(date +%s%3N)"
  runtime_ms=$((end_ms - start_ms))
  durations+=("$runtime_ms")

  json="$(printf '%s\n' "$output" | sed -n '/^{/,$p')"

  predicted_project_id="$(jq -r '.resolution.resolvedProjectId // ""' <<<"$json")"
  score="$(jq -r '.resolution.projectMatchScore // ""' <<<"$json")"
  candidate_count="$(jq -r '(.resolution.candidates | length) // 0' <<<"$json")"
  story_rows="$(jq -r '.counts.story_rows_total // 0' <<<"$json")"
  linked_rows="$(jq -r '.linkage.linked_to_project // 0' <<<"$json")"
  unlinked_rows="$(jq -r '.linkage.unlinked_rows // 0' <<<"$json")"

  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$case_type" \
    "$email_id" \
    "$expected_project_id" \
    "$predicted_project_id" \
    "$score" \
    "$candidate_count" \
    "$story_rows" \
    "$linked_rows" \
    "$unlinked_rows" \
    "$runtime_ms" >>"$CASES_CSV"

  if [[ "$case_type" == "linked" ]]; then
    linked_total=$((linked_total + 1))
    if [[ -n "$predicted_project_id" ]]; then
      linked_predicted=$((linked_predicted + 1))
      if [[ "$predicted_project_id" == "$expected_project_id" ]]; then
        linked_match=$((linked_match + 1))
      else
        linked_wrong=$((linked_wrong + 1))
      fi

      if [[ -n "$score" ]]; then
        local t
        for t in "${thresholds[@]}"; do
          if (( score >= t )); then
            threshold_predicted["$t"]=$((threshold_predicted["$t"] + 1))
            if [[ "$predicted_project_id" == "$expected_project_id" ]]; then
              threshold_match["$t"]=$((threshold_match["$t"] + 1))
            else
              threshold_wrong["$t"]=$((threshold_wrong["$t"] + 1))
            fi
          fi
        done
      fi
    else
      linked_unresolved=$((linked_unresolved + 1))
    fi
  else
    unlinked_total=$((unlinked_total + 1))
    if [[ -n "$predicted_project_id" ]]; then
      unlinked_predicted=$((unlinked_predicted + 1))
    fi
  fi
}

while IFS=$'\t' read -r email_id expected_project_id; do
  [[ -z "${email_id:-}" ]] && continue
  run_case "linked" "$email_id" "$expected_project_id"
done <"$tmp_linked"

while IFS=$'\t' read -r email_id; do
  [[ -z "${email_id:-}" ]] && continue
  run_case "unlinked" "$email_id" ""
done <"$tmp_unlinked"

if ((${#durations[@]} == 0)); then
  echo "No replay cases found; adjust --since or limits." >&2
  exit 1
fi

sorted_durations=($(printf '%s\n' "${durations[@]}" | sort -n))
n="${#sorted_durations[@]}"
p50_idx=$(((n - 1) / 2))
p95_idx=$((((95 * n + 99) / 100) - 1))
if ((p95_idx < 0)); then p95_idx=0; fi
if ((p95_idx >= n)); then p95_idx=$((n - 1)); fi

min_runtime="${sorted_durations[0]}"
max_runtime="${sorted_durations[$((n - 1))]}"
p50_runtime="${sorted_durations[$p50_idx]}"
p95_runtime="${sorted_durations[$p95_idx]}"
avg_runtime="$(printf '%s\n' "${durations[@]}" | awk '{s+=$1} END {printf "%.1f", s/NR}')"

linked_accuracy_pct="0.0"
linked_precision_pct="0.0"
linked_coverage_pct="0.0"
unlinked_prediction_rate_pct="0.0"

if ((linked_total > 0)); then
  linked_accuracy_pct="$(awk -v a="$linked_match" -v b="$linked_total" 'BEGIN{printf "%.2f", (100*a)/b}')"
  linked_coverage_pct="$(awk -v a="$linked_predicted" -v b="$linked_total" 'BEGIN{printf "%.2f", (100*a)/b}')"
fi
if (((linked_match + linked_wrong) > 0)); then
  linked_precision_pct="$(awk -v a="$linked_match" -v b="$((linked_match + linked_wrong))" 'BEGIN{printf "%.2f", (100*a)/b}')"
fi
if ((unlinked_total > 0)); then
  unlinked_prediction_rate_pct="$(awk -v a="$unlinked_predicted" -v b="$unlinked_total" 'BEGIN{printf "%.2f", (100*a)/b}')"
fi

cat >"$SUMMARY_JSON" <<EOF
{
  "label": "$LABEL",
  "settings": {
    "since": "$SINCE",
    "timelineLimit": $TIMELINE_LIMIT,
    "queryScope": "$QUERY_SCOPE",
    "threadEvidenceScope": "$THREAD_EVIDENCE_SCOPE",
    "maxQueryChars": $MAX_QUERY_CHARS,
    "simulateUnlinked": true
  },
  "counts": {
    "linkedTotal": $linked_total,
    "unlinkedTotal": $unlinked_total
  },
  "linkedMetrics": {
    "predicted": $linked_predicted,
    "match": $linked_match,
    "wrong": $linked_wrong,
    "unresolved": $linked_unresolved,
    "accuracyPct": $linked_accuracy_pct,
    "precisionPct": $linked_precision_pct,
    "coveragePct": $linked_coverage_pct
  },
  "unlinkedMetrics": {
    "predicted": $unlinked_predicted,
    "predictionRatePct": $unlinked_prediction_rate_pct
  },
  "scoreThresholds": {
    "250": {
      "predicted": ${threshold_predicted[250]},
      "match": ${threshold_match[250]},
      "wrong": ${threshold_wrong[250]}
    },
    "370": {
      "predicted": ${threshold_predicted[370]},
      "match": ${threshold_match[370]},
      "wrong": ${threshold_wrong[370]}
    },
    "380": {
      "predicted": ${threshold_predicted[380]},
      "match": ${threshold_match[380]},
      "wrong": ${threshold_wrong[380]}
    },
    "430": {
      "predicted": ${threshold_predicted[430]},
      "match": ${threshold_match[430]},
      "wrong": ${threshold_wrong[430]}
    },
    "500": {
      "predicted": ${threshold_predicted[500]},
      "match": ${threshold_match[500]},
      "wrong": ${threshold_wrong[500]}
    }
  },
  "runtimeMs": {
    "avg": $avg_runtime,
    "min": $min_runtime,
    "p50": $p50_runtime,
    "p95": $p95_runtime,
    "max": $max_runtime
  },
  "artifacts": {
    "casesCsv": "$CASES_CSV"
  }
}
EOF

echo "Wrote $CASES_CSV"
echo "Wrote $SUMMARY_JSON"
cat "$SUMMARY_JSON"
