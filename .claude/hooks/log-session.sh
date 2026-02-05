#!/bin/bash
# Log session activity to AGENT_LOG.md
# Triggered on Stop hook - when Claude finishes responding

# Read hook input from stdin
INPUT=$(cat)

# Extract fields
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // ""')

# Get project root from environment
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$CWD}"
LOG_FILE="$PROJECT_DIR/AGENT_LOG.md"

# Skip if no transcript
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Extract tool calls from transcript (last 50 lines to keep it recent)
TOOLS=$(tail -100 "$TRANSCRIPT_PATH" | jq -r '
  select(.type == "assistant" and .message.content != null) |
  .message.content[] |
  select(.type == "tool_use") |
  .name
' 2>/dev/null | sort | uniq -c | sort -rn | head -10)

# Extract any file paths that were edited/written
FILES=$(tail -100 "$TRANSCRIPT_PATH" | jq -r '
  select(.type == "assistant" and .message.content != null) |
  .message.content[] |
  select(.type == "tool_use" and (.name == "Edit" or .name == "Write")) |
  .input.file_path // empty
' 2>/dev/null | sort -u | head -10)

# Get timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Only log if there were tool calls
if [ -n "$TOOLS" ]; then
  # Create log file if doesn't exist
  if [ ! -f "$LOG_FILE" ]; then
    echo "# Agent Activity Log" > "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    echo "Auto-generated log of Claude Code sessions." >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    echo "---" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
  fi

  # Append entry
  {
    echo "## $TIMESTAMP"
    echo ""
    echo "**Session:** \`${SESSION_ID:0:8}\`"
    echo ""
    echo "**Tools used:**"
    echo "\`\`\`"
    echo "$TOOLS"
    echo "\`\`\`"

    if [ -n "$FILES" ]; then
      echo ""
      echo "**Files modified:**"
      echo "$FILES" | while read -r f; do
        if [ -n "$f" ]; then
          # Make path relative to project
          REL_PATH="${f#$PROJECT_DIR/}"
          echo "- \`$REL_PATH\`"
        fi
      done
    fi

    echo ""
    echo "---"
    echo ""
  } >> "$LOG_FILE"
fi

# Return success (don't block Claude from stopping)
echo '{"ok": true}'
exit 0
