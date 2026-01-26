"""
Tests for identify_document extraction.

Run: uv run pytest tests/test_identify.py -v
"""

import json
import re
import shutil
import tempfile
from pathlib import Path

import pytest

from mistral_mcp.client import MistralClient
from mistral_mcp.pdf_utils import extract_pages, get_pdf_info


def sanitize_filename(name: str) -> str:
    """Sanitize a string for use in filenames."""
    name = re.sub(r"[\s_]+", "-", name)
    name = re.sub(r"[^\w\-]", "", name)
    name = re.sub(r"-+", "-", name)
    return name.strip("-")


def normalize_for_match(name: str) -> str:
    """Normalize a name for comparison (handles LLM variance in punctuation)."""
    # Collapse whitespace and hyphens to single space
    name = re.sub(r"[\s\-]+", " ", name)
    return name.strip()

IDENTIFY_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "gc_company": {"type": "string"},
        "project_name": {"type": "string"},
        "document_type": {
            "type": "string",
            "enum": [
                "contract",
                "estimate",
                "LOI",
                "change_order",
                "permit",
                "insurance_cert",
                "invoice",
                "correspondence",
                "other",
            ],
        },
        "action_required": {"type": ["string", "null"]},
        "deadline": {"type": ["string", "null"]},
        "document_number": {"type": ["string", "null"]},
    },
    "required": ["gc_company", "project_name", "document_type"],
}

IDENTIFY_PROMPT = """Identify this construction document.

Extract:
- gc_company: The legal company name (from letterhead/signature block, not logos)
- project_name: The project name (use common/short name, not full legal)
- document_type: contract, estimate, LOI, change_order, permit,
  insurance_cert, invoice, correspondence, or other.
- action_required: If recipient must act, describe briefly. Else null.
- deadline: Deadline in YYYY-MM-DD format, or null if none.
- document_number: Any ID/number on the doc.

Be concise."""


async def run_identify(client: MistralClient, file_path: Path) -> dict[str, object]:
    """Helper to run identification on a PDF."""
    info = get_pdf_info(str(file_path))
    pages = min(3, info.page_count)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extract_pages(str(file_path), 1, pages, tmp_path)
        result = await client.extract_structured(
            IDENTIFY_PROMPT,
            IDENTIFY_SCHEMA,
            schema_name="identify",
            document_path=tmp_path,
        )
        return json.loads(result)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# Ground truth from actual documents
CONTRACT_EXPECTED = {
    "gc_company": "NFC LLC",
    "project_name": "Good Day Carwash - Gilbert",
    "document_type": "contract",
    "document_number": "1730001-001",
}

LOI_EXPECTED = {
    "gc_company": "A.R. MAYS CONSTRUCTION",
    "project_name": "Sprouts 058 Rita Ranch",
    "document_type": "LOI",
    "document_number": "251056-008",
}


@pytest.mark.asyncio
async def test_contract_gc_company(
    mistral_client: MistralClient, contract_pdf: Path
) -> None:
    """Contract: gc_company must be exactly 'NFC LLC'."""
    result = await run_identify(mistral_client, contract_pdf)
    assert result["gc_company"] == CONTRACT_EXPECTED["gc_company"]


@pytest.mark.asyncio
async def test_contract_project_name(
    mistral_client: MistralClient, contract_pdf: Path
) -> None:
    """Contract: project_name must be exactly 'Good Day Carwash - Gilbert'."""
    result = await run_identify(mistral_client, contract_pdf)
    assert result["project_name"] == CONTRACT_EXPECTED["project_name"]


@pytest.mark.asyncio
async def test_contract_document_type(
    mistral_client: MistralClient, contract_pdf: Path
) -> None:
    """Contract: document_type must be 'contract'."""
    result = await run_identify(mistral_client, contract_pdf)
    assert result["document_type"] == CONTRACT_EXPECTED["document_type"]


@pytest.mark.asyncio
async def test_contract_document_number(
    mistral_client: MistralClient, contract_pdf: Path
) -> None:
    """Contract: document_number must be '1730001-001'."""
    result = await run_identify(mistral_client, contract_pdf)
    assert result["document_number"] == CONTRACT_EXPECTED["document_number"]


@pytest.mark.asyncio
async def test_loi_gc_company(
    mistral_client: MistralClient, loi_pdf: Path
) -> None:
    """LOI: gc_company must be exactly 'A.R. MAYS CONSTRUCTION'."""
    result = await run_identify(mistral_client, loi_pdf)
    assert result["gc_company"] == LOI_EXPECTED["gc_company"]


@pytest.mark.asyncio
async def test_loi_project_name(
    mistral_client: MistralClient, loi_pdf: Path
) -> None:
    """LOI: project_name must normalize to 'Sprouts 058 Rita Ranch'."""
    result = await run_identify(mistral_client, loi_pdf)
    # LLM may return with or without hyphen - both normalize to same value
    assert normalize_for_match(result["project_name"]) == normalize_for_match(
        LOI_EXPECTED["project_name"]
    )


@pytest.mark.asyncio
async def test_loi_document_type(
    mistral_client: MistralClient, loi_pdf: Path
) -> None:
    """LOI: document_type must be 'LOI'."""
    result = await run_identify(mistral_client, loi_pdf)
    assert result["document_type"] == LOI_EXPECTED["document_type"]


@pytest.mark.asyncio
async def test_loi_document_number(
    mistral_client: MistralClient, loi_pdf: Path
) -> None:
    """LOI: document_number must be '251056-008'."""
    result = await run_identify(mistral_client, loi_pdf)
    assert result["document_number"] == LOI_EXPECTED["document_number"]


async def run_identify_with_rename(
    client: MistralClient, file_path: Path
) -> tuple[dict[str, object], Path]:
    """Run identification and rename in a temp directory. Returns (result, new_path)."""
    info = get_pdf_info(str(file_path))
    pages = min(3, info.page_count)

    # Create temp dir and copy file
    tmp_dir = Path(tempfile.mkdtemp())
    tmp_file = tmp_dir / file_path.name
    shutil.copy(file_path, tmp_file)

    # Extract first pages for identification
    extract_tmp = tmp_dir / "extract.pdf"
    extract_pages(str(tmp_file), 1, pages, str(extract_tmp))

    result = await client.extract_structured(
        IDENTIFY_PROMPT,
        IDENTIFY_SCHEMA,
        schema_name="identify",
        document_path=str(extract_tmp),
    )
    result = json.loads(result)

    # Apply rename logic (same as server.py)
    doc_type = sanitize_filename(result.get("document_type", "unknown"))
    project = sanitize_filename(result.get("project_name", "unknown"))
    gc = sanitize_filename(result.get("gc_company", "unknown"))
    doc_num = result.get("document_number")

    if doc_num:
        doc_num_clean = sanitize_filename(doc_num)
        new_name = f"{doc_type}_{project}_{gc}_{doc_num_clean}{tmp_file.suffix}"
    else:
        new_name = f"{doc_type}_{project}_{gc}{tmp_file.suffix}"

    new_path = tmp_file.parent / new_name
    tmp_file.rename(new_path)

    # Clean up extract temp
    extract_tmp.unlink(missing_ok=True)

    return result, new_path


# Expected renamed filenames
CONTRACT_EXPECTED_FILENAME = "contract_Good-Day-Carwash-Gilbert_NFC-LLC_1730001-001.pdf"
LOI_EXPECTED_FILENAME = "LOI_Sprouts-058-Rita-Ranch_AR-MAYS-CONSTRUCTION_251056-008.pdf"


@pytest.mark.asyncio
async def test_contract_rename(
    mistral_client: MistralClient, contract_pdf: Path
) -> None:
    """Contract: rename produces correct filename."""
    result, new_path = await run_identify_with_rename(mistral_client, contract_pdf)
    try:
        assert new_path.name == CONTRACT_EXPECTED_FILENAME
        assert new_path.exists()
    finally:
        # Clean up temp dir
        shutil.rmtree(new_path.parent, ignore_errors=True)


@pytest.mark.asyncio
async def test_loi_rename(
    mistral_client: MistralClient, loi_pdf: Path
) -> None:
    """LOI: rename produces correct filename."""
    result, new_path = await run_identify_with_rename(mistral_client, loi_pdf)
    try:
        assert new_path.name == LOI_EXPECTED_FILENAME
        assert new_path.exists()
    finally:
        # Clean up temp dir
        shutil.rmtree(new_path.parent, ignore_errors=True)
