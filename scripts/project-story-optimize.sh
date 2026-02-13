#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPLAY_CMD="$ROOT_DIR/scripts/project-story-replay.sh"

SINCE="${SINCE:-2026-01-01}"
LINKED_LIMIT="${LINKED_LIMIT:-20}"
UNLINKED_LIMIT="${UNLINKED_LIMIT:-20}"
TIMELINE_LIMIT="${TIMELINE_LIMIT:-6}"
THREAD_EVIDENCE_SCOPE="${THREAD_EVIDENCE_SCOPE:-strict}"
OUT_DIR="${OUT_DIR:-data/reports/project-story-replay}"
RUN_TAG="${RUN_TAG:-$(date +%Y%m%d-%H%M%S)}"

declare -a labels

run_cfg() {
  local scope="$1"
  local max_chars="$2"
  local label="${scope}-q${max_chars}-${THREAD_EVIDENCE_SCOPE}-${RUN_TAG}"
  labels+=("$label")
  "$REPLAY_CMD" \
    --linked-limit "$LINKED_LIMIT" \
    --unlinked-limit "$UNLINKED_LIMIT" \
    --since "$SINCE" \
    --timeline-limit "$TIMELINE_LIMIT" \
    --query-scope "$scope" \
    --thread-evidence-scope "$THREAD_EVIDENCE_SCOPE" \
    --max-query-chars "$max_chars" \
    --out-dir "$OUT_DIR" \
    --label "$label" \
    >/dev/null
}

run_cfg "subject" "600"
run_cfg "subject_meta" "1200"
run_cfg "full" "1200"

echo "label,query_scope,thread_scope,match,wrong,unresolved,accuracy_pct,precision_pct,coverage_pct,unlinked_predicted,avg_ms,p95_ms,summary_json"
for label in "${labels[@]}"; do
  summary="$OUT_DIR/$label.summary.json"
  jq -r --arg path "$summary" '
    [
      .label,
      .settings.queryScope,
      .settings.threadEvidenceScope,
      .linkedMetrics.match,
      .linkedMetrics.wrong,
      .linkedMetrics.unresolved,
      .linkedMetrics.accuracyPct,
      .linkedMetrics.precisionPct,
      .linkedMetrics.coveragePct,
      .unlinkedMetrics.predicted,
      .runtimeMs.avg,
      .runtimeMs.p95,
      $path
    ] | @csv
  ' "$summary"
done
