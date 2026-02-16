"""Tests for ADEQ NOI certificate extraction.

Uses ground-truth expected JSON from permit-workers fixtures.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pdf_analysis.ingest import extract_text
from pdf_analysis.noi import (
    NOIExtraction,
    _format_phone,
    _is_just_number,
    _strip,
    extract_noi,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# Navigate from pdf-analysis-cli/tests/ → repo root → dust-permits fixtures
_REPO = Path(__file__).resolve().parent.parent.parent.parent.parent
FIXTURES = _REPO / "apps" / "dust-permits" / "tests" / "fixtures"
PDFS = FIXTURES / "pdfs"
EXPECTED = FIXTURES / "expected"


# ---------------------------------------------------------------------------
# Helper parsing tests
# ---------------------------------------------------------------------------


class TestHelpers:
    def test_strip_none(self):
        assert _strip(None) is None

    def test_strip_empty(self):
        assert _strip("") is None
        assert _strip("   ") is None

    def test_strip_value(self):
        assert _strip("  hello  ") == "hello"

    def test_format_phone_10_digits(self):
        assert _format_phone("6022919255") == "(602) 291-9255"

    def test_format_phone_already_formatted(self):
        assert _format_phone("(602) 291-9255") == "(602) 291-9255"

    def test_format_phone_none(self):
        assert _format_phone(None) is None

    def test_format_phone_short(self):
        assert _format_phone("12345") == "12345"

    def test_is_just_number_true(self):
        assert _is_just_number("104") is True
        assert _is_just_number("5045") is True

    def test_is_just_number_false(self):
        assert _is_just_number("104 W WIGWAM BLVD") is False
        assert _is_just_number("1383 N TECH BLVD") is False


# ---------------------------------------------------------------------------
# Extraction tests against ground truth
# ---------------------------------------------------------------------------


def _load_expected(name: str) -> dict:
    return json.loads((EXPECTED / name).read_text())


def _assert_field(result: dict, expected: dict, field: str):
    """Assert a single field matches, with helpful error message."""
    assert result.get(field) == expected.get(field), (
        f"Field '{field}': got {result.get(field)!r}, expected {expected.get(field)!r}"
    )


class TestBjerkBuilders:
    """NOI-Innovative_Commercial_Building-113509-Bjerk_Builders_LLC-2025-11-14.pdf"""

    @pytest.fixture()
    def result(self) -> NOIExtraction:
        pdf = PDFS / "NOI-Innovative_Commercial_Building-113509-Bjerk_Builders_LLC-2025-11-14.pdf"
        assert pdf.exists(), f"Fixture not found: {pdf}"
        text_result = extract_text(pdf)
        return extract_noi(text_result.text)

    @pytest.fixture()
    def expected(self) -> dict:
        return _load_expected("noi-bjerk-builders-113509.json")

    def test_applicant_name(self, result: NOIExtraction, expected: dict):
        assert result.applicant_name == expected["applicantName"]

    def test_applicant_address(self, result: NOIExtraction, expected: dict):
        data = result.model_dump(by_alias=True)
        _assert_field(data, expected, "applicantAddress1")
        _assert_field(data, expected, "applicantAddress2")
        _assert_field(data, expected, "applicantCity")
        _assert_field(data, expected, "applicantState")
        _assert_field(data, expected, "applicantZip")

    def test_site_info(self, result: NOIExtraction, expected: dict):
        data = result.model_dump(by_alias=True)
        _assert_field(data, expected, "siteName")
        _assert_field(data, expected, "siteAddress")
        _assert_field(data, expected, "latitude")
        _assert_field(data, expected, "longitude")
        _assert_field(data, expected, "acresDisturbed")

    def test_swppp_contact(self, result: NOIExtraction, expected: dict):
        data = result.model_dump(by_alias=True)
        _assert_field(data, expected, "swpppContactFirstName")
        _assert_field(data, expected, "swpppContactLastName")
        _assert_field(data, expected, "swpppContactEmail")
        _assert_field(data, expected, "swpppContactPhone")

    def test_permit_ids(self, result: NOIExtraction, expected: dict):
        data = result.model_dump(by_alias=True)
        _assert_field(data, expected, "permitId")
        _assert_field(data, expected, "ltfNumber")

    def test_extraction_meta(self, result: NOIExtraction, expected: dict):
        data = result.model_dump(by_alias=True)
        assert data["_extraction"]["confidence"] == expected["_extraction"]["confidence"]
        assert data["_extraction"]["missingFields"] == expected["_extraction"]["missingFields"]

    def test_no_warnings(self, result: NOIExtraction):
        assert result.extraction_meta.warnings == []

    def test_full_match(self, result: NOIExtraction, expected: dict):
        """Exact match of all data fields (excluding _extraction)."""
        data = result.model_dump(by_alias=True)
        for key in expected:
            if key == "_extraction":
                continue
            assert data[key] == expected[key], f"Mismatch on '{key}': {data[key]!r} != {expected[key]!r}"


class TestBPRCompanies:
    """NOI-PV_Redevelopment_Phase_5-110437-BPR_Companies_LLC-2025-08-12.pdf

    Older format: no direct Lat/Long, has site address, broken Address Line 1.
    """

    @pytest.fixture()
    def result(self) -> NOIExtraction:
        pdf = PDFS / "NOI-PV_Redevelopment_Phase_5-110437-BPR_Companies_LLC-2025-08-12.pdf"
        assert pdf.exists(), f"Fixture not found: {pdf}"
        text_result = extract_text(pdf)
        return extract_noi(text_result.text)

    @pytest.fixture()
    def expected(self) -> dict:
        return _load_expected("noi-bpr-companies-110437.json")

    def test_applicant_name(self, result: NOIExtraction, expected: dict):
        assert result.applicant_name == expected["applicantName"]

    def test_broken_address_combined(self, result: NOIExtraction, expected: dict):
        """Address Line 1 was just '104' — should be combined with Line 2."""
        data = result.model_dump(by_alias=True)
        _assert_field(data, expected, "applicantAddress1")
        _assert_field(data, expected, "applicantAddress2")

    def test_address_warning(self, result: NOIExtraction, expected: dict):
        """Should warn about broken address."""
        assert len(result.extraction_meta.warnings) == len(expected["_extraction"]["warnings"])
        assert "street number" in result.extraction_meta.warnings[0].lower()

    def test_site_address_constructed(self, result: NOIExtraction, expected: dict):
        """Older format has site address fields — should construct combined address."""
        assert result.site_address == expected["siteAddress"]

    def test_coordinates_from_outfall(self, result: NOIExtraction, expected: dict):
        """No direct Lat/Long — coordinates come from Outfall section."""
        assert result.latitude == expected["latitude"]
        assert result.longitude == expected["longitude"]

    def test_full_match(self, result: NOIExtraction, expected: dict):
        data = result.model_dump(by_alias=True)
        for key in expected:
            if key == "_extraction":
                continue
            assert data[key] == expected[key], f"Mismatch on '{key}': {data[key]!r} != {expected[key]!r}"


class TestSLC114131:
    """NOI 114131_CGP25_NEWPERMIT_NOI_CERTIFICATE.pdf

    Newest CGP25 format. No expected JSON file — test against known values from OCR.
    """

    @pytest.fixture()
    def result(self) -> NOIExtraction:
        pdf = PDFS / "noi_swppp" / "NOI 114131_CGP25_NEWPERMIT_NOI_CERTIFICATE.pdf"
        assert pdf.exists(), f"Fixture not found: {pdf}"
        text_result = extract_text(pdf)
        return extract_noi(text_result.text)

    def test_applicant(self, result: NOIExtraction):
        assert result.applicant_name == "STEVENS LEINWEBER CONSTRUCTION, INC."
        assert result.applicant_address1 == "5045 N 12TH ST"
        assert result.applicant_address2 == "STE 200"
        assert result.applicant_city == "PHOENIX"
        assert result.applicant_state == "AZ"
        assert result.applicant_zip == "85014"

    def test_site(self, result: NOIExtraction):
        assert result.site_name == "Lexington 420 - Northern Pkwy Logistics Bldg. D"
        assert result.site_address is None
        assert result.latitude == 33.561333
        assert result.longitude == -112.39168
        assert result.acres_disturbed == 64.3

    def test_swppp_contact(self, result: NOIExtraction):
        assert result.swppp_contact_first_name == "Ryan"
        assert result.swppp_contact_last_name == "Patterson"
        assert result.swppp_contact_email == "rpatterson@stevensleinweber.com"
        assert result.swppp_contact_phone == "(602) 527-0704"

    def test_permit_ids(self, result: NOIExtraction):
        assert result.permit_id == "AZC114131"
        assert result.ltf_number == "114131"

    def test_high_confidence(self, result: NOIExtraction):
        assert result.extraction_meta.confidence == "high"

    def test_no_warnings(self, result: NOIExtraction):
        assert result.extraction_meta.warnings == []
