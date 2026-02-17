---
name: session-history-continuation
description: >-
  Recover prior Claude and OpenAI Codex conversation sessions from local logs and
  continue from the correct stopping point.
---

# Session History Continuation

Use one skill for one bounded problem:
recover prior conversation context and return the correct continuation command.

Use this skill when a user asks to:
- resume/continue a Claude conversation by UUID (for example `claude --resume <session_id>`),
- find prior Claude chats,
- search past Codex chats,
- recover earlier agent work for project follow-up.

## Provider Command Map

- Claude:
  - resume specific: `claude --resume <session_id>`
  - resume most recent in cwd: `claude --continue`
  - fork from prior session: `claude --resume <session_id> --fork-session`
- OpenAI Codex:
  - resume specific: `codex resume <session_id>`
  - resume most recent: `codex resume --last`
  - fork from prior session: `codex fork <session_id>`

## Workflow (Unified)

1. Capture intent and anchor terms.

- If the user provides a UUID-like value, treat it as the primary key.
- Otherwise extract 3–5 high-signal terms from the request and use them as search anchors.
- Detect explicit provider cues:
  - Claude cues: `claude --resume`, `claude --continue`, `~/.claude/...`
  - Codex cues: `codex resume`, `codex fork`, `~/.codex/...`
  - If no cues, search both stores.

2. Locate all potential matches across log locations.

```bash
# UUID or keyword search: Claude + Codex session directories
rg --files ~/.claude/projects ~/.codex/sessions 2>/dev/null | rg -n "$SESSION_ID_OR_TERMS"

# Transcript/content search in conversation files
rg -l --no-heading --glob "*.jsonl" "$SESSION_ID_OR_TERMS" ~/.claude/projects ~/.codex/sessions 2>/dev/null
rg -n --no-heading -S "$TERM1|$TERM2|$TERM3" ~/.claude/projects ~/.codex/sessions ~/.codex/history.jsonl ~/.codex/session_index.jsonl 2>/dev/null

# Broadening Codex-first anchor scan when UUID is missing
rg -n --no-heading -S "\"session\"|\"session_id\"|\"resume\"|\"project\"|\"estimate\"|\"ticket\"" ~/.codex/history.jsonl ~/.codex/session_index.jsonl
```

3. Explicitly separate transcript sources.

- Main Claude session transcript:
  - `~/.claude/projects/<repo>/.../<session_id>.jsonl`
- Claude subagent transcripts:
  - `~/.claude/projects/<repo>/.../<session_id>/subagents/<name>.jsonl`
- Codex metadata/transcripts:
  - `~/.codex/history.jsonl`
  - `~/.codex/session_index.jsonl`
  - `~/.codex/sessions/<session-id>.jsonl`

4. Extract recency context when continuing.

```bash
rg -n --no-heading '"type":"user"|"type":"assistant"|"type":"assistant-text"|"messages"' <matched-file>.jsonl | tail -n 20
sed -n '1,220p' <matched-file>.jsonl
```

5. Pick continuation command by provider.

- Claude definitive match: `claude --resume <session_id>`
- Codex definitive match: `codex resume <session_id>`

6. Return a unified result contract.

- `provider`: `claude` or `codex`
- `session_id`: UUID when known
- `match_type`: `main`, `subagent`, `transcript`, `metadata`
- `path`: exact path
- `relevance`: one-line reason
- `continuation_command`: provider-correct command

7. Resolve ambiguity.

- If exactly one definitive match exists:
  - return the unified result fields
  - include last user/assistant turn boundary
- If matches include multiple sessions:
  - return every candidate with unified fields
  - ask user to choose
- If only subagent transcripts match:
  - state it clearly and list direct subagent files
- If no match:
  - report searched paths and query terms
  - propose 3 alternate anchors

## Output Rules

- Do not claim no history until all locations are checked:
  `~/.claude`, `~/.codex/sessions`, `~/.codex/session_index.jsonl`, `~/.codex/history.jsonl`.
- Always return exact matching paths.
- Always label each match as `main`, `subagent`, `metadata`, or `transcript`.
- For Codex matches, be explicit whether path is actual transcript vs index metadata.
- Never infer a session from a guessed name; only use matching IDs/paths.
- `~/.codex/sessions` checks should rely on matching file paths only.

## Example

- Claude UUID request:
  - `provider`: `claude`
  - `path`: `~/.claude/projects/-home-simon-github-desert-services-hub/1f2eac3d-6e14-464f-ae17-8c228e9cf819.jsonl`
  - `continuation_command`: `claude --resume 1f2eac3d-6e14-464f-ae17-8c228e9cf819`
- Codex UUID request:
  - `provider`: `codex`
  - `path`: `~/.codex/sessions/<session-id>.jsonl`
  - `continuation_command`: `codex resume <session-id>`
