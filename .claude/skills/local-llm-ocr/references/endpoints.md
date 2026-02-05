# Endpoints (OpenAI-compatible)

Defaults:

- Base URL: `https://ollama.peacockery.studio/v1`
- API key: `ollama` (typically ignored, but many clients require one)

## List models

```bash
curl -sS https://ollama.peacockery.studio/v1/models \
  -H "Authorization: Bearer ollama" | jq '.data[].id'
```

## Chat completion (curl)

```bash
curl -sS https://ollama.peacockery.studio/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ollama" \
  -d '{
    "model": "ministral-3:8b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "temperature": 0,
    "max_tokens": 128,
    "stream": false
  }'
```

## OCR (curl)

Use `.claude/skills/local-llm-ocr/scripts/ocr_image.py` for local files. If you need raw curl, send a `data:image/...;base64,...` URL in `image_url.url`.
