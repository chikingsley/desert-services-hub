"""Shared fixtures for integration tests."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cf_mcp.client import CloudflareClient
from cf_mcp.config import Settings

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> dict[str, str]:
    """Read .env file as key=value pairs."""
    env_file = PROJECT_ROOT / ".env"
    if not env_file.exists():
        return {}
    vals = {}
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        vals[key.strip()] = value.strip()
    return vals


@pytest.fixture(autouse=True)
def _env_from_dotenv(monkeypatch):
    """Ensure .env values override any stale shell env vars."""
    vals = _load_dotenv()
    if not vals.get("CF_API_TOKEN"):
        pytest.skip(".env file missing or no CF_API_TOKEN — skipping live test")
    for key, value in vals.items():
        monkeypatch.setenv(key, value)


@pytest.fixture
def settings() -> Settings:
    return Settings()


@pytest.fixture
async def client(settings: Settings):
    c = CloudflareClient(settings)
    yield c
    await c.close()


@pytest.fixture
def test_zone() -> str:
    """Zone name for integration tests. Set CF_TEST_ZONE or defaults to first available zone."""
    zone = os.environ.get("CF_TEST_ZONE", "")
    if not zone:
        pytest.skip("CF_TEST_ZONE not set — skipping DNS tests")
    return zone
