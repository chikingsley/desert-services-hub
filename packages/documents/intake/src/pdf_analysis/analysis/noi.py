"""Extract structured data from ADEQ NOI (Notice of Intent) certificate text.

Operates on already-extracted text (from parse pipeline or kreuzberg).
Handles both CGP25 (newer) and older ADEQ NOI formats:
- Newer: Has direct Lat/Long fields, no site address
- Older: Has site address under Location, coordinates from Outfall section
- Both: Labeled fields (Name:, Address Line 1:, Site Name:, etc.)
"""

from __future__ import annotations

import re

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


class Outfall(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    latitude: float
    longitude: float


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

    outfalls: list[Outfall] = Field(default_factory=list)

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
_OUTFALL = re.compile(r"^([A-Z][\w\s/]+?)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)", re.MULTILINE)


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
        please_note = full_text.find("Please note,", swppp_start)
        end = please_note if please_note > swppp_start else len(full_text)
        sections["swppp"] = full_text[swppp_start:end]

    return sections


def _first_match(pattern: re.Pattern[str], text: str) -> str | None:
    """Return the first capture group of a pattern match, or None."""
    m = pattern.search(text)
    return _strip(m.group(1)) if m else None


def _extract_outfalls(text: str) -> list[Outfall]:
    """Extract all outfall coordinates from the text."""
    outfalls: list[Outfall] = []
    for match in _OUTFALL.finditer(text):
        name = match.group(1).strip()
        lat = float(match.group(2))
        lng = float(match.group(3))
        outfalls.append(Outfall(name=name, latitude=lat, longitude=lng))
    return outfalls


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------


def extract_noi(text: str) -> NOIExtraction:
    """Extract structured NOI data from already-extracted text.

    The text should come from the parse pipeline (kreuzberg + OCR + reconcile)
    or any other extraction method. This function only does regex parsing.
    """
    warnings: list[str] = []
    # Strip markdown formatting so regexes work on both plain text and markdown
    full_text = re.sub(r"\*\*", "", text)
    full_text = re.sub(r"^\* ", "", full_text, flags=re.MULTILINE)

    if len(full_text.strip()) < 50:
        raise ValueError(f"Text too short for NOI extraction — only {len(full_text.strip())} chars")

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

    # Extract all outfalls
    outfalls = _extract_outfalls(site_info)

    # If no direct coordinates, fall back to first outfall
    if latitude is None and outfalls:
        latitude = outfalls[0].latitude
        longitude = outfalls[0].longitude
        warnings.append("Site coordinates derived from first outfall (older NOI format)")

    # Site address: older format has address lines under Location
    site_address: str | None = None
    site_addr_match = _ADDR1.search(site_info)
    if site_addr_match:
        site_addr1 = _strip(site_addr_match.group(1))
        site_city = _first_match(_CITY, site_info)
        site_state = _first_match(_STATE, site_info) or "AZ"
        site_zip = _first_match(_ZIP, site_info)

        parts = [
            p
            for p in [site_addr1, site_city, f"{site_state} {site_zip}" if site_zip else None]
            if p
        ]
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

    critical_present = all([applicant_name, site_name, email])
    confidence = "high" if critical_present else "medium"

    return NOIExtraction.model_validate(
        {
            "applicant_name": applicant_name or "UNKNOWN",
            "applicant_address1": applicant_addr1,
            "applicant_address2": applicant_addr2,
            "applicant_city": applicant_city,
            "applicant_state": applicant_state,
            "applicant_zip": applicant_zip,
            "site_name": site_name or "UNKNOWN",
            "site_address": site_address,
            "latitude": latitude,
            "longitude": longitude,
            "acres_disturbed": acres_disturbed,
            "outfalls": [o.model_dump() for o in outfalls],
            "swppp_contact_first_name": first_name,
            "swppp_contact_last_name": last_name,
            "swppp_contact_email": email,
            "swppp_contact_phone": phone,
            "permit_id": permit_id,
            "ltf_number": ltf_number,
            "extraction_meta": {
                "confidence": confidence,
                "missing_fields": missing,
                "warnings": warnings,
            },
        }
    )
