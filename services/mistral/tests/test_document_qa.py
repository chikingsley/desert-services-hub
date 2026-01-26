"""
Integration tests for document Q&A.

Run with: uv run pytest tests/test_document_qa.py -v
"""

from pathlib import Path

import pytest

from mistral_mcp.client import MistralClient


@pytest.mark.asyncio
async def test_document_qa_from_url(mistral_api_key: str):
    """Ask a question about a PDF from URL."""
    client = MistralClient()

    url = "https://arxiv.org/pdf/2310.06825.pdf"
    question = "What is this paper about?"

    answer = await client.document_qa(question, document_url=url)

    assert answer
    assert len(answer) > 50


@pytest.mark.asyncio
async def test_document_qa_from_file(mistral_api_key: str, sample_contract: Path):
    """Ask a question about a local PDF."""
    client = MistralClient()

    question = "What type of document is this?"

    answer = await client.document_qa(question, document_path=str(sample_contract))

    assert answer
    assert len(answer) > 10


@pytest.mark.asyncio
async def test_document_qa_contract_details(mistral_api_key: str, sample_contract: Path):
    """Ask about specific contract details."""
    client = MistralClient()

    question = "Who are the parties involved in this contract or agreement?"

    answer = await client.document_qa(question, document_path=str(sample_contract))

    assert answer
    # Should mention some party names


@pytest.mark.asyncio
async def test_document_qa_contract_amounts(mistral_api_key: str, medium_contract: Path):
    """Ask about amounts in a contract."""
    client = MistralClient()

    question = "What is the total amount or price mentioned in this document?"

    answer = await client.document_qa(question, document_path=str(medium_contract))

    assert answer


@pytest.mark.asyncio
async def test_document_qa_swppp(mistral_api_key: str, swppp_contract: Path):
    """Ask about SWPPP contract specifics."""
    client = MistralClient()

    question = "What is this document about and what services are being contracted?"

    answer = await client.document_qa(question, document_path=str(swppp_contract))

    assert answer
    assert len(answer) > 20
