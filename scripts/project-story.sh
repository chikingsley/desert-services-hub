#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/project-story.sh [--project-id <id>] [--email-id <id>] [--subject <text>] [--query <text>] [--since <YYYY-MM-DD>] [--timeline-limit <n>]

Description:
  Builds a single-shot project story JSON by resolving the best project candidate
  from sparse input and returning linked/unlinked signal, estimate linkage,
  attachment/document summaries, and a deduped timeline.

Examples:
  scripts/project-story.sh --project-id 103
  scripts/project-story.sh --subject "FW: DPX8 - Site Surrender Project"
  scripts/project-story.sh --email-id 820833
  scripts/project-story.sh --query "DPX8 Ironstone"
USAGE
}

PROJECT_ID="${PROJECT_ID:-${PROJECT_STORY_PROJECT_ID:-}}"
EMAIL_ID="${EMAIL_ID:-${PROJECT_STORY_EMAIL_ID:-}}"
SUBJECT="${SUBJECT:-${PROJECT_STORY_SUBJECT:-}}"
QUERY="${QUERY:-${PROJECT_STORY_QUERY:-}}"
SINCE="${SINCE:-${PROJECT_STORY_SINCE:-}}"
TIMELINE_LIMIT="${TIMELINE_LIMIT:-${PROJECT_STORY_TIMELINE_LIMIT:-30}}"

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

DB_CONTAINER="supabase_db_desert-services-hub"

cat scripts/sql/project_story.sql | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
  -v project_id="$PROJECT_ID" \
  -v email_id="$EMAIL_ID" \
  -v subject="$SUBJECT" \
  -v query="$QUERY" \
  -v since="$SINCE" \
  -v timeline_limit="$TIMELINE_LIMIT"
