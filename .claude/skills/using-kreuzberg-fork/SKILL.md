---
name: using-kreuzberg-fork
description: Install and use the Kreuzberg fork branch in local projects and containers with uv sync. Use when the user asks to pin/install kreuzberg from chikingsley/kreuzberg, enable rapidocr, or switch between git/local editable installs.
---

# Using Kreuzberg Fork

## Trigger

Use this skill when requests mention any of:
- install Kreuzberg from fork
- use branch from `chikingsley/kreuzberg`
- local editable Kreuzberg across repos
- container install for Kreuzberg + RapidOCR
- `uv sync` setup for Kreuzberg extras

## Rules

- Prefer `uv sync` over `uv pip` for project-managed environments.
- Default OCR backend for this fork is `rapid-ocr`.
- Use explicit git refs when reproducibility matters (tag or commit SHA instead of floating branch).

## Local Project Install (Git Fork)

For a project that should consume the forked Python package directly from Git:

```bash
uv add "kreuzberg[rapidocr] @ git+https://github.com/chikingsley/kreuzberg.git@54f047c46#subdirectory=packages/python"
uv add "onnxruntime==1.24.1"
uv sync
```

For reproducible installs, keep the commit SHA pinned and update it intentionally when you want to roll forward.

## Local Project Install (Editable Path)

Use this when developing Kreuzberg and another local project together.

1. In Kreuzberg repo:

```bash
cd /home/simon/github/kreuzberg/packages/python
uv sync --extra rapidocr
uv run maturin develop
```

2. In consumer project:

```bash
uv add --editable /home/simon/github/kreuzberg/packages/python
uv sync
```

## Container Pattern

Use one of these patterns:

1. Git-based install in container:

```bash
uv add "kreuzberg[rapidocr] @ git+https://github.com/chikingsley/kreuzberg.git@54f047c46#subdirectory=packages/python"
uv add "onnxruntime==1.24.1"
uv sync --frozen
```

2. Pre-built wheel copied into image, then:

```bash
uv add /tmp/kreuzberg-*.whl
uv sync --frozen
```

## Runtime Example

```python
from kreuzberg import ExtractionConfig, OcrConfig, extract_file_sync

config = ExtractionConfig(ocr=OcrConfig(backend="rapid-ocr", language="eng"))
result = extract_file_sync("document.pdf", config=config)
```

## Quick Verification

Run inside the target environment:

```bash
uv run python -c "import kreuzberg, rapidocr, onnxruntime; print('ok')"
```

Then smoke test OCR:

```bash
uv run python - <<'PY'
from kreuzberg import ExtractionConfig, OcrConfig, extract_file_sync
cfg = ExtractionConfig(ocr=OcrConfig(backend='rapid-ocr', language='eng'))
print(extract_file_sync('test_documents/images/ocr_image.jpg', config=cfg).metadata)
PY
```
