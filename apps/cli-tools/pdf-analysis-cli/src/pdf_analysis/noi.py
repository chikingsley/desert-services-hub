"""Extract structured data from ADEQ NOI (Notice of Intent) certificate PDFs.

Handles both CGP25 (newer) and older ADEQ NOI formats:
- Newer: Has direct Lat/Long fields, no site address
- Older: Has site address under Location, coordinates from Outfall section
- Both: Labeled fields (Name:, Address Line 1:, Site Name:, etc.)
"""

from __future__ import annotations

import asyncio
import base64
import os
import re
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx
import pdfplumber
import pymupdf
from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ExtractionMeta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: str = "noi"
    confidence: str = "high"
    missing_fields: list[str] = Field(default_factory=list, alias="missingFields")
    warnings: list[str] = Field(default_factory=list)


class NOIExtraction(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    applicant_name: str = Field(alias="applicantName")
    applicant_address1: str | None = Field(None, alias="applicantAddress1")
    applicant_address2: str | None = Field(None, alias="applicantAddress2")
    applicant_city: str | None = Field(None, alias="applicantCity")
    applicant_state: str | None = Field(None, alias="applicantState")
    applicant_zip: str | None = Field(None, alias="applicantZip")

    site_name: str = Field(alias="siteName")
    site_address: str | None = Field(None, alias="siteAddress")
    latitude: float | None = None
    longitude: float | None = None
    acres_disturbed: float | None = Field(None, alias="acresDisturbed")

    swppp_contact_first_name: str | None = Field(None, alias="swpppContactFirstName")
    swppp_contact_last_name: str | None = Field(None, alias="swpppContactLastName")
    swppp_contact_email: str | None = Field(None, alias="swpppContactEmail")
    swppp_contact_phone: str | None = Field(None, alias="swpppContactPhone")

    permit_id: str | None = Field(None, alias="permitId")
    ltf_number: str | None = Field(None, alias="ltfNumber")

    extraction_meta: ExtractionMeta = Field(default_factory=ExtractionMeta, alias="_extraction")


# ---------------------------------------------------------------------------
# Regex patterns (compiled once at module level)
# ---------------------------------------------------------------------------

_LTF = re.compile(r"LTF#:\s*(\d+)")
_PERMIT_ID = re.compile(r"ID#:\s*(AZC\d+)")
_NAME = re.compile(r"Name:\s*(.+)")
_ADDR1 = re.compile(r"Address Line 1:\s*(.+)")
_ADDR2 = re.compile(r"Address Line 2:\s*(.+)")
_CITY = re.compile(r"City:\s*(.+)")
_STATE = re.compile(r"State:\s*([A-Z]{2})")
_ZIP = re.compile(r"Zip:\s*(\d{5})")
_SITE_NAME = re.compile(r"Site Name:\s*(.+)")
_LAT_LONG = re.compile(r"Lat:\s*([\d.-]+)\s*/\s*Long:\s*([\d.-]+)")
_ACRES = re.compile(r"Acres Disturbed:\s*([\d.]+)")
_FIRST_NAME = re.compile(r"First Name:\s*(.+)")
_LAST_NAME = re.compile(r"Last Name:\s*(.+)")
_PHONE = re.compile(r"Phone:\s*(.+)")
_EMAIL = re.compile(r"Work Email:\s*(.+)")
# Outfall line: NAME | lat | long | ...
_OUTFALL = re.compile(r"^[A-Z][\w\s/]+\|\s*([\d.-]+)\s*\|\s*([\d.-]+)", re.MULTILINE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip(value: str | None) -> str | None:
    """Strip whitespace, return None for empty strings."""
    if value is None:
        return None
    v = value.strip()
    return v if v else None


def _format_phone(raw: str | None) -> str | None:
    """Format 10-digit phone as (XXX) XXX-XXXX."""
    if raw is None:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return raw.strip()


def _is_just_number(value: str) -> bool:
    """Check if a string is just a street number (digits only, no street name)."""
    return bool(re.match(r"^\d+$", value.strip()))


def _parse_sections(full_text: str) -> dict[str, str]:
    """Split text into logical sections for context-aware field extraction."""
    sections: dict[str, str] = {"coverage": "", "site_info": "", "swppp": ""}

    # Find section boundaries
    coverage_start = full_text.find("Coverage Issued to:")
    site_info_start = full_text.find("Construction Site Information:")
    swppp_start = full_text.find("SWPPP Contact Information:")

    if coverage_start >= 0:
        end = site_info_start if site_info_start > coverage_start else len(full_text)
        sections["coverage"] = full_text[coverage_start:end]

    if site_info_start >= 0:
        end = swppp_start if swppp_start > site_info_start else len(full_text)
        sections["site_info"] = full_text[site_info_start:end]

    if swppp_start >= 0:
        # End at the boilerplate "Please note" paragraph
        please_note = full_text.find("Please note,", swppp_start)
        end = please_note if please_note > swppp_start else len(full_text)
        sections["swppp"] = full_text[swppp_start:end]

    return sections


def _first_match(pattern: re.Pattern[str], text: str) -> str | None:
    """Return the first capture group of a pattern match, or None."""
    m = pattern.search(text)
    return _strip(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

async def _ocr_pdf(pdf_path: Path) -> str:
    """OCR a PDF using glm-ocr via Ollama when pdfplumber can't extract text."""
    endpoint = os.environ.get("OLLAMA_ENDPOINT", "https://ollama.peacockery.studio/v1").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "glm-ocr:latest")

    doc = pymupdf.open(pdf_path)
    try:
        chunks: list[str] = []
        with TemporaryDirectory(prefix="noi-ocr-") as temp_dir:
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
                img_path = Path(temp_dir) / f"page_{page_num}.png"
                pix.save(str(img_path))

                image_b64 = base64.b64encode(img_path.read_bytes()).decode()

                async with httpx.AsyncClient(timeout=90.0) as client:
                    resp = await client.post(
                        f"{endpoint}/chat/completions",
                        json={
                            "model": model,
                            "messages": [
                                {
                                    "role": "user",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "Extract all visible text from this document page. "
                                            "Preserve structure, labels, and field values exactly.",
                                        },
                                        {
                                            "type": "image_url",
                                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                                        },
                                    ],
                                }
                            ],
                        },
                    )
                    resp.raise_for_status()
                    text = resp.json()["choices"][0]["message"]["content"]
                    chunks.append(text.strip())

        return "\n\n".join(chunks)
    finally:
        doc.close()


def extract_noi(pdf_path: Path | str, *, ocr_fallback: bool = False) -> NOIExtraction:
    """Extract structured NOI data from an ADEQ NOI certificate PDF.

    Uses pdfplumber for text extraction and regex for field parsing.
    Falls back to glm-ocr via Ollama when ocr_fallback=True and pdfplumber fails.
    """
    pdf_path = Path(pdf_path)
    warnings: list[str] = []
    missing: list[str] = []

    # Extract all text from all pages
    pages_text: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)

    full_text = "\n".join(pages_text)

    if len(full_text.strip()) < 50:
        if not ocr_fallback:
            raise ValueError(
                f"PDF appears to be scanned or empty — only {len(full_text.strip())} chars extracted"
            )
        full_text = asyncio.run(_ocr_pdf(pdf_path))
        warnings.append("Used OCR fallback (scanned PDF)")
        if len(full_text.strip()) < 50:
            raise ValueError(
                f"OCR also failed — only {len(full_text.strip())} chars extracted"
            )

    # Split into logical sections
    sections = _parse_sections(full_text)

    # --- Global fields (anywhere in document) ---
    ltf_number = _first_match(_LTF, full_text)
    permit_id = _first_match(_PERMIT_ID, full_text)

    # --- Applicant fields (from Coverage section) ---
    coverage = sections["coverage"]
    applicant_name = _first_match(_NAME, coverage)
    applicant_addr1 = _first_match(_ADDR1, coverage)
    applicant_addr2 = _first_match(_ADDR2, coverage)
    applicant_city = _first_match(_CITY, coverage)
    applicant_state = _first_match(_STATE, coverage)
    # Zip might be on page 2 (after page break) — search coverage first, then full text
    applicant_zip = _first_match(_ZIP, coverage) or _first_match(_ZIP, full_text)

    # Handle broken address: if addr1 is just a number, use addr2 as the real addr1
    if applicant_addr1 and _is_just_number(applicant_addr1) and applicant_addr2:
        warnings.append(
            f"Applicant address line 1 contained only street number "
            f"'{applicant_addr1}' - combined with line 2"
        )
        applicant_addr1 = applicant_addr2
        applicant_addr2 = None

    # --- Site fields (from Site Info section) ---
    site_info = sections["site_info"]
    site_name = _first_match(_SITE_NAME, site_info)
    acres_text = _first_match(_ACRES, site_info)
    acres_disturbed = float(acres_text) if acres_text else None

    # Coordinates: try direct Lat/Long first (newer format)
    lat_long_match = _LAT_LONG.search(site_info)
    latitude: float | None = None
    longitude: float | None = None

    if lat_long_match:
        latitude = float(lat_long_match.group(1))
        longitude = float(lat_long_match.group(2))
    else:
        # Older format: extract from Outfall coordinates
        outfall_match = _OUTFALL.search(site_info)
        if outfall_match:
            latitude = float(outfall_match.group(1))
            longitude = float(outfall_match.group(2))

    # Site address: older format has address lines under Location
    site_address: str | None = None
    # Check if site_info has its own Address Line 1 (separate from applicant address)
    site_addr_match = _ADDR1.search(site_info)
    if site_addr_match:
        site_addr1 = _strip(site_addr_match.group(1))
        site_city = _first_match(_CITY, site_info)
        site_state = _first_match(_STATE, site_info) or "AZ"
        site_zip = _first_match(_ZIP, site_info)

        parts = [p for p in [site_addr1, site_city, f"{site_state} {site_zip}" if site_zip else None] if p]
        if parts:
            site_address = ", ".join(parts)

    # --- SWPPP Contact (from SWPPP section) ---
    swppp = sections["swppp"]
    first_name = _first_match(_FIRST_NAME, swppp)
    last_name = _first_match(_LAST_NAME, swppp)
    phone = _format_phone(_first_match(_PHONE, swppp))
    email = _first_match(_EMAIL, swppp)

    # --- Build missing fields list ---
    field_checks = {
        "applicantName": applicant_name,
        "applicantAddress1": applicant_addr1,
        "applicantCity": applicant_city,
        "applicantState": applicant_state,
        "applicantZip": applicant_zip,
        "siteName": site_name,
        "siteAddress": site_address,
        "latitude": latitude,
        "longitude": longitude,
        "acresDisturbed": acres_disturbed,
        "swpppContactFirstName": first_name,
        "swpppContactLastName": last_name,
        "swpppContactEmail": email,
        "swpppContactPhone": phone,
        "ltfNumber": ltf_number,
    }
    missing = [k for k, v in field_checks.items() if v is None]

    # Confidence: high if we got the critical fields, medium if some missing
    critical_present = all([applicant_name, site_name, email])
    confidence = "high" if critical_present else "medium"

    return NOIExtraction(
        applicant_name=applicant_name or "UNKNOWN",
        applicant_address1=applicant_addr1,
        applicant_address2=applicant_addr2,
        applicant_city=applicant_city,
        applicant_state=applicant_state,
        applicant_zip=applicant_zip,
        site_name=site_name or "UNKNOWN",
        site_address=site_address,
        latitude=latitude,
        longitude=longitude,
        acres_disturbed=acres_disturbed,
        swppp_contact_first_name=first_name,
        swppp_contact_last_name=last_name,
        swppp_contact_email=email,
        swppp_contact_phone=phone,
        permit_id=permit_id,
        ltf_number=ltf_number,
        extraction_meta=ExtractionMeta(
            confidence=confidence,
            missing_fields=missing,
            warnings=warnings,
        ),
    )
