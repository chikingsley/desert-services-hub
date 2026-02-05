#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
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


def _request_json(url: str, method: str, headers: dict[str, str], body: dict | None = None) -> dict:
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    request = urllib.request.Request(url=url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
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
    parser = argparse.ArgumentParser(description="Probe local OpenAI-compatible endpoint and print available models.")
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
    parser.add_argument("--probe-chat", action="store_true", help="Also run a minimal chat completion.")
    parser.add_argument("--model", default="ministral-3:8b", help="Model to use for --probe-chat.")
    parser.add_argument("--prompt", default="Say OK", help="Prompt to use for --probe-chat.")
    args = parser.parse_args()

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {args.api_key}",
    }

    models_url = _join_url(args.base_url, "/models")
    models = _request_json(models_url, method="GET", headers=headers)

    ids: list[str] = []
    for entry in models.get("data", []):
        model_id = entry.get("id")
        if isinstance(model_id, str):
            ids.append(model_id)

    print(f"base_url={args.base_url}")
    print(f"models={len(ids)}")
    for model_id in ids[:50]:
        print(f"- {model_id}")
    if len(ids) > 50:
        print(f"... (+{len(ids) - 50} more)")

    if args.probe_chat:
        chat_url = _join_url(args.base_url, "/chat/completions")
        response = _request_json(
            chat_url,
            method="POST",
            headers=headers,
            body={
                "model": args.model,
                "messages": [{"role": "user", "content": args.prompt}],
                "temperature": 0,
                "max_tokens": 64,
                "stream": False,
            },
        )
        content = (
            response.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
        )
        print("\nchat_probe=" + (content if isinstance(content, str) else repr(content)))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

