"""
Pytest fixtures for integration tests.

Fixtures are stored in tests/fixtures/ and committed to the repo.
"""

import os
from pathlib import Path

import pytest

from mistral_mcp.client import MistralClient

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def mistral_client() -> MistralClient:
    """Get MistralClient, skip if no API key."""
    key = os.environ.get("MISTRAL_API_KEY")
    if not key:
        pytest.skip("MISTRAL_API_KEY not set")
    return MistralClient(api_key=key)


@pytest.fixture
def contract_pdf() -> Path:
    """NFC Contracting contract (~99KB)."""
    return FIXTURES_DIR / "contract_nfc.pdf"


@pytest.fixture
def loi_pdf() -> Path:
    """Sprouts LOI (~817KB)."""
    return FIXTURES_DIR / "loi_sprouts.pdf"
