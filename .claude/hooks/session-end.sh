#!/bin/bash
# Final session summary on SessionEnd
# Adds a session end marker to the log

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
REASON=$(echo "$INPUT" | jq -r '.reason // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"
LOG_FILE="$PROJECT_DIR/AGENT_LOG.md"

# Only log if log file exists (meaning we logged something this session)
if [ -f "$LOG_FILE" ]; then
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

  # Add session end marker
  {
    echo "### Session ended: $TIMESTAMP"
    echo ""
    echo "**Reason:** $REASON"
    echo ""
    echo "---"
    echo ""
  } >> "$LOG_FILE"
fi

exit 0
