# talon-extract

Email signature extraction and structured contact parsing. Uses Talon's bruteforce heuristics for signature detection and a local LLM (Ollama) for structured field extraction.

## Setup

```bash
cd apps/talon
uv sync
```

## Usage

```bash
# Test on a single email address
uv run talon-extract test john@example.com

# Extract signatures for all contacts missing titles
uv run talon-extract extract --limit 10

# Dry run (preview only)
uv run talon-extract extract --dry-run

# Save results to JSON
uv run talon-extract extract --output results.json
```

## How it works

1. Queries hub.db for contacts missing titles that have emails in the database
2. Fetches the most recent email bodies from each contact
3. Uses Talon's heuristic algorithm to extract the signature block
4. Sends the signature to a local LLM (Ollama) for structured field parsing
5. Outputs hub CLI update commands to push enrichment data
