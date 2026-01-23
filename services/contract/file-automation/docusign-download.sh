#!/bin/bash
# DocuSign Download Skill
# Downloads a completed document as Combined PDF from a DocuSign link

set -e

URL="$1"
OUTPUT_DIR="${2:-$HOME/Downloads}"

if [ -z "$URL" ]; then
  echo "Usage: docusign-download.sh <docusign-url> [output-dir]"
  exit 1
fi

echo "Opening DocuSign link..."
agent-browser open "$URL"

echo "Waiting for page load..."
agent-browser wait --load networkidle

# Check if there's a disclosure checkbox
SNAPSHOT=$(agent-browser snapshot -i 2>&1)

if echo "$SNAPSHOT" | grep -q "I agree to use electronic"; then
  echo "Accepting disclosure..."
  agent-browser eval "document.querySelector('input[type=\"checkbox\"]').click()"
  sleep 1

  # Find and click Continue button
  CONTINUE_REF=$(echo "$SNAPSHOT" | grep -i "Continue" | grep -oE '@e[0-9]+' | head -1)
  if [ -n "$CONTINUE_REF" ]; then
    echo "Clicking Continue ($CONTINUE_REF)..."
    agent-browser click "$CONTINUE_REF"
    agent-browser wait 3000
  fi
fi

# Get fresh snapshot after potential navigation
echo "Getting page elements..."
SNAPSHOT=$(agent-browser snapshot -i 2>&1)

# Find Download button
DOWNLOAD_REF=$(echo "$SNAPSHOT" | grep -E 'button "Download"' | grep -oE '@e[0-9]+' | head -1)

if [ -z "$DOWNLOAD_REF" ]; then
  echo "Error: Could not find Download button"
  agent-browser screenshot /tmp/docusign-error.png
  agent-browser close
  exit 1
fi

echo "Clicking Download ($DOWNLOAD_REF)..."
agent-browser click "$DOWNLOAD_REF"
agent-browser wait 1000

# Get fresh snapshot for menu
SNAPSHOT=$(agent-browser snapshot -i 2>&1)

# Find Combined PDF option
COMBINED_REF=$(echo "$SNAPSHOT" | grep -i "Combined PDF" | grep -oE '@e[0-9]+' | head -1)

if [ -z "$COMBINED_REF" ]; then
  echo "Error: Could not find Combined PDF option"
  agent-browser screenshot /tmp/docusign-error.png
  agent-browser close
  exit 1
fi

echo "Selecting Combined PDF ($COMBINED_REF)..."
agent-browser click "$COMBINED_REF"

echo "Waiting for download..."
agent-browser wait 5000

# Take final screenshot
agent-browser screenshot /tmp/docusign-complete.png

echo "Closing browser..."
agent-browser close

echo "Done! Check $OUTPUT_DIR for downloaded PDF"
