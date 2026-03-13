from __future__ import annotations

from typing import Any

import httpx
import pytest

from pdf_analysis.config import Settings
from pdf_analysis.providers.openrouter import OpenRouterProvider


class _FakeResponse:
    status_code = 200
    text = ""

    def json(self) -> dict[str, Any]:
        return {
            "choices": [
                {
                    "message": {
                        "content": '{"isWorkRelated": true, "category": "work_related", "confidence": 0.9, "reason": "project traffic"}'
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 123,
                "completion_tokens": 45,
                "total_tokens": 168,
            },
        }


class _FakeAsyncClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, url: str, headers: dict[str, str], json: dict[str, Any]) -> _FakeResponse:
        return _FakeResponse()


@pytest.mark.asyncio
async def test_openrouter_chat_preserves_usage_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        openrouter_api_key="test-key",
        openrouter_model="google/gemini-3.1-flash-lite-preview",
    )
    provider = OpenRouterProvider(settings)
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    result = await provider.chat("Classify this sender domain")

    assert result.metadata["usage"] == {
        "prompt_tokens": 123,
        "completion_tokens": 45,
        "total_tokens": 168,
    }
