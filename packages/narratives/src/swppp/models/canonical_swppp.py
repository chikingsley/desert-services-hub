"""Canonical SWPPP payload models used for deterministic narrative mapping."""

from __future__ import annotations

from datetime import date, datetime
import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator


_MDY_DATE_RE = re.compile(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$")
_ACRES_NUMBER_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)")


def _parse_date(value: object) -> date:
    """Parse the date formats observed in the canonical corpus."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not isinstance(value, str):
        raise ValueError(f"Unsupported date type: {type(value).__name__}")

    raw = value.strip()
    if not raw:
        raise ValueError("Date is required")

    mdy = _MDY_DATE_RE.match(raw)
    if mdy:
        month, day, year = (int(mdy.group(i)) for i in (1, 2, 3))
        return date(year, month, day)

    # Fallback: ISO date and related variants.
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(f"Unsupported date format: {raw}") from exc


def _parse_optional_acres_number(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None

    raw = value.strip()
    if not raw:
        return None

    direct = raw.replace(",", "")
    try:
        return float(direct)
    except ValueError:
        pass

    match = _ACRES_NUMBER_RE.search(direct)
    if not match:
        return None
    return float(match.group(1))


class CanonicalProject(BaseModel):
    """Canonical project fields derived from narrative inventory."""

    name: str = Field(..., min_length=1)
    address_line1: str = Field(..., min_length=1)
    city_state_zip: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    county: Optional[str] = None


class CanonicalPermit(BaseModel):
    """Canonical permit identifiers."""

    azpdes_number: Optional[str] = None
    azcon_number: Optional[str] = None
    number_best_effort: Optional[str] = None


class CanonicalDates(BaseModel):
    """Canonical date fields."""

    swppp_preparation_date: date
    project_start: date
    project_completion: date

    @field_validator("swppp_preparation_date", "project_start", "project_completion", mode="before")
    @classmethod
    def parse_dates(cls, value: object) -> date:
        return _parse_date(value)


class CanonicalOperatorContact(BaseModel):
    """Operator contact block."""

    company: str = Field(..., min_length=1)
    contact_name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)
    email: Optional[str] = None
    address_line1: Optional[str] = None
    city_state_zip: Optional[str] = None


class CanonicalSWPPPContact(BaseModel):
    """Named SWPPP contact block."""

    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)


class CanonicalEmergencyContact(BaseModel):
    """Emergency 24-hour contact block."""

    contact_name: Optional[str] = None
    phone: Optional[str] = None


class CanonicalSite(BaseModel):
    """Site metrics and narrative descriptors."""

    total_project_area_acres: Optional[str] = None
    total_project_area_acres_number: Optional[float] = Field(default=None, gt=0)
    disturbed_area_acres: Optional[str] = None
    disturbed_area_acres_number: Optional[float] = Field(default=None, gt=0)
    soil_types: Optional[str] = None
    slopes: Optional[str] = None
    receiving_waters: Optional[str] = None
    storm_sewer_systems: Optional[str] = None

    @field_validator("total_project_area_acres_number", "disturbed_area_acres_number", mode="before")
    @classmethod
    def parse_area_numbers(cls, value: object) -> Optional[float]:
        return _parse_optional_acres_number(value)


class CanonicalBMPec7(BaseModel):
    """BMP EC-7 canonical fields."""

    responsible_staff: Optional[str] = None
    installation_schedule: Optional[str] = None
    maintenance: Optional[str] = None


class CanonicalBMP(BaseModel):
    """Canonical BMP group."""

    ec7: CanonicalBMPec7 = Field(default_factory=CanonicalBMPec7)


class CanonicalSWPPPPayload(BaseModel):
    """Deterministic canonical payload used before template rendering."""

    project: CanonicalProject
    permit: CanonicalPermit
    dates: CanonicalDates
    operator: CanonicalOperatorContact
    swppp_contact: CanonicalSWPPPContact
    emergency: CanonicalEmergencyContact = Field(default_factory=CanonicalEmergencyContact)
    site: CanonicalSite
    bmp: CanonicalBMP = Field(default_factory=CanonicalBMP)

