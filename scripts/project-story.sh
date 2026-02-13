#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/project-story.sh [--project-id <id>] [--email-id <id>] [--subject <text>] [--query <text>] [--since <YYYY-MM-DD>] [--timeline-limit <n>] [--query-scope <subject|subject_meta|full>] [--thread-evidence-scope <strict|extended>] [--simulate-unlinked] [--max-query-chars <n>]

Description:
  Builds a single-shot project story JSON by resolving the best project candidate
  from sparse input and returning linked/unlinked signal, estimate linkage,
  attachment/document summaries, and a deduped timeline.

Examples:
  scripts/project-story.sh --project-id 103
  scripts/project-story.sh --subject "FW: DPX8 - Site Surrender Project"
  scripts/project-story.sh --email-id 820833
  scripts/project-story.sh --query "DPX8 Ironstone"
  scripts/project-story.sh --email-id 820833 --simulate-unlinked --query-scope subject_meta --thread-evidence-scope strict
USAGE
}

PROJECT_ID="${PROJECT_ID:-${PROJECT_STORY_PROJECT_ID:-}}"
EMAIL_ID="${EMAIL_ID:-${PROJECT_STORY_EMAIL_ID:-}}"
SUBJECT="${SUBJECT:-${PROJECT_STORY_SUBJECT:-}}"
QUERY="${QUERY:-${PROJECT_STORY_QUERY:-}}"
SINCE="${SINCE:-${PROJECT_STORY_SINCE:-}}"
TIMELINE_LIMIT="${TIMELINE_LIMIT:-${PROJECT_STORY_TIMELINE_LIMIT:-30}}"
QUERY_SCOPE="${QUERY_SCOPE:-${PROJECT_STORY_QUERY_SCOPE:-subject_meta}}"
SIMULATE_UNLINKED="${SIMULATE_UNLINKED:-${PROJECT_STORY_SIMULATE_UNLINKED:-0}}"
MAX_QUERY_CHARS="${MAX_QUERY_CHARS:-${PROJECT_STORY_MAX_QUERY_CHARS:-1200}}"
THREAD_EVIDENCE_SCOPE="${THREAD_EVIDENCE_SCOPE:-${PROJECT_STORY_THREAD_EVIDENCE_SCOPE:-extended}}"

normalize_arg() {
  local value="${1:-}"
  if [[ "$value" == "''" || "$value" == "\"\"" ]]; then
    echo ""
    return
  fi
  if [[ ${#value} -ge 2 ]]; then
    local first="${value:0:1}"
    local last="${value: -1}"
    if [[ ( "$first" == "'" && "$last" == "'" ) || ( "$first" == "\"" && "$last" == "\"" ) ]]; then
      echo "${value:1:${#value}-2}"
      return
    fi
  fi
  echo "$value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --email-id)
      EMAIL_ID="${2:-}"
      shift 2
      ;;
    --subject)
      SUBJECT="${2:-}"
      shift 2
      ;;
    --query)
      QUERY="${2:-}"
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
    --simulate-unlinked)
      SIMULATE_UNLINKED="1"
      shift
      ;;
    --no-simulate-unlinked)
      SIMULATE_UNLINKED="0"
      shift
      ;;
    --max-query-chars)
      MAX_QUERY_CHARS="${2:-}"
      shift 2
      ;;
    --thread-evidence-scope)
      THREAD_EVIDENCE_SCOPE="${2:-}"
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

PROJECT_ID="$(normalize_arg "$PROJECT_ID")"
EMAIL_ID="$(normalize_arg "$EMAIL_ID")"
SUBJECT="$(normalize_arg "$SUBJECT")"
QUERY="$(normalize_arg "$QUERY")"
SINCE="$(normalize_arg "$SINCE")"
TIMELINE_LIMIT="$(normalize_arg "$TIMELINE_LIMIT")"
QUERY_SCOPE="$(normalize_arg "$QUERY_SCOPE")"
SIMULATE_UNLINKED="$(normalize_arg "$SIMULATE_UNLINKED")"
MAX_QUERY_CHARS="$(normalize_arg "$MAX_QUERY_CHARS")"
THREAD_EVIDENCE_SCOPE="$(normalize_arg "$THREAD_EVIDENCE_SCOPE")"

if [[ -z "$PROJECT_ID" && -z "$EMAIL_ID" && -z "$SUBJECT" && -z "$QUERY" ]]; then
  echo "Provide at least one of: --project-id, --email-id, --subject, --query" >&2
  usage >&2
  exit 1
fi

if [[ -n "$PROJECT_ID" && ! "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "--project-id must be numeric." >&2
  exit 1
fi

if [[ -n "$EMAIL_ID" && ! "$EMAIL_ID" =~ ^[0-9]+$ ]]; then
  echo "--email-id must be numeric." >&2
  exit 1
fi

if [[ ! "$TIMELINE_LIMIT" =~ ^[0-9]+$ ]]; then
  echo "--timeline-limit must be numeric." >&2
  exit 1
fi

if [[ ! "$MAX_QUERY_CHARS" =~ ^[0-9]+$ ]]; then
  echo "--max-query-chars must be numeric." >&2
  exit 1
fi

if [[ "$SIMULATE_UNLINKED" != "0" && "$SIMULATE_UNLINKED" != "1" ]]; then
  echo "--simulate-unlinked must be 0 or 1." >&2
  exit 1
fi

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

DB_CONTAINER="supabase_db_desert-services-hub"

cat scripts/sql/project_story.sql | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
  -qAt \
  -v project_id="$PROJECT_ID" \
  -v email_id="$EMAIL_ID" \
  -v subject="$SUBJECT" \
  -v query="$QUERY" \
  -v since="$SINCE" \
  -v timeline_limit="$TIMELINE_LIMIT" \
  -v query_scope="$QUERY_SCOPE" \
  -v thread_evidence_scope="$THREAD_EVIDENCE_SCOPE" \
  -v simulate_unlinked="$SIMULATE_UNLINKED" \
  -v max_query_chars="$MAX_QUERY_CHARS"
