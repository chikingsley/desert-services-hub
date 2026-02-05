---
name: local-llm-ocr
description: Use local LLM inference endpoints (OpenAI-compatible) exposed from a GPU machine via Cloudflare tunnels, especially for OCR with `glm-ocr:latest` on images. Use when you need to run chat completions against the local Ollama endpoint, OCR screenshots/scans, or quickly check which models are available.
---

# local-llm-ocr

## Defaults (override via env)

- `LOCAL_LLM_BASE_URL`: `https://ollama.peacockery.studio/v1`
- `LOCAL_LLM_API_KEY`: `ollama` (required by some clients; usually ignored server-side)
- OCR model: `glm-ocr:latest`

## Quick test

```bash
python3 .claude/skills/local-llm-ocr/scripts/status.py
python3 .claude/skills/local-llm-ocr/scripts/status.py --probe-chat --model ministral-3:8b --prompt "Say OK"
```

## OCR an image

```bash
python3 .claude/skills/local-llm-ocr/scripts/ocr_image.py /path/to/image.png
python3 .claude/skills/local-llm-ocr/scripts/ocr_image.py /path/to/image.jpg --prompt "Extract all text, keep line breaks"
```

## Notes

- If you see `Could not resolve host` or other networking errors, run the test/OCR commands from a shell environment with DNS/network access.
- For curl/Python SDK examples and SSH ops commands, see:
  - `.claude/skills/local-llm-ocr/references/endpoints.md`
  - `.claude/skills/local-llm-ocr/references/ops.md`

