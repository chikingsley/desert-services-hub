# Operations (gmk-server)

These commands run on the GPU box over SSH.

## Check what backend is running

```bash
ssh gmk-server "mm status"
```

## Switch backend

```bash
ssh gmk-server "mm ollama"
ssh gmk-server "mm stop"
```

## List available Ollama models

```bash
ssh gmk-server "curl -s localhost:11434/api/tags | jq -r '.models[].name'"
```

## Preload a model into VRAM (keep alive)

```bash
ssh gmk-server "curl -s localhost:11434/api/generate -d '{\"model\":\"glm-ocr:latest\",\"keep_alive\":-1}'"
```
