#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value


def _join_url(base_url: str, path: str) -> str:
    base_url = base_url.rstrip("/")
    path = "/" + path.lstrip("/")
    return base_url + path


def _guess_mime(path: pathlib.Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    if ext in {"jpg", "jpeg"}:
        return "image/jpeg"
    if ext == "png":
        return "image/png"
    if ext == "webp":
        return "image/webp"
    if ext == "gif":
        return "image/gif"
    return "application/octet-stream"


def _request_json(url: str, headers: dict[str, str], body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=url, method="POST", data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read()
    except urllib.error.HTTPError as e:
        raw = e.read()
        raise RuntimeError(f"HTTP {e.code} calling {url}: {raw[:500]!r}") from e
    except Exception as e:
        raise RuntimeError(f"Request failed calling {url}: {e}") from e

    try:
        return json.loads(raw.decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"Non-JSON response from {url}: {raw[:500]!r}") from e


def main() -> int:
    parser = argparse.ArgumentParser(description="OCR a local image via local OpenAI-compatible vision model.")
    parser.add_argument("image_path", help="Path to a local image (png/jpg/webp/gif).")
    parser.add_argument(
        "--base-url",
        default=_env("LOCAL_LLM_BASE_URL", "https://ollama.peacockery.studio/v1"),
        help="OpenAI-compatible base URL (env: LOCAL_LLM_BASE_URL).",
    )
    parser.add_argument(
        "--api-key",
        default=_env("LOCAL_LLM_API_KEY", "ollama"),
        help="API key (env: LOCAL_LLM_API_KEY).",
    )
    parser.add_argument("--model", default="glm-ocr:latest", help="Vision/OCR model.")
    parser.add_argument("--prompt", default="Extract all text from this image.", help="Instruction for the OCR model.")
    parser.add_argument("--max-tokens", type=int, default=2048, help="Max tokens in response.")
    args = parser.parse_args()

    path = pathlib.Path(args.image_path).expanduser()
    if not path.exists() or not path.is_file():
        print(f"Image not found: {path}", file=sys.stderr)
        return 2

    mime = _guess_mime(path)
    image_b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
    data_url = f"data:{mime};base64,{image_b64}"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {args.api_key}",
    }

    url = _join_url(args.base_url, "/chat/completions")
    response = _request_json(
        url,
        headers=headers,
        body={
            "model": args.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": args.prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            "temperature": 0,
            "max_tokens": args.max_tokens,
            "stream": False,
        },
    )

    choice0 = (response.get("choices") or [{}])[0]
    message = choice0.get("message") or {}
    content = message.get("content")

    if isinstance(content, str):
        sys.stdout.write(content)
        if not content.endswith("\n"):
            sys.stdout.write("\n")
        return 0

    sys.stdout.write(json.dumps(response, indent=2))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

