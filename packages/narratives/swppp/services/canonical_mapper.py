"""Deterministic mapper from canonical narrative payload -> SWPPPData."""

from __future__ import annotations

from datetime import timedelta
import re
from typing import Optional

from swppp.models.canonical_swppp import CanonicalSWPPPPayload
from swppp.models.swppp import ContactInfo, PermitInfo, ProjectInfo, SWPPPData, SiteDetails


_CITY_STATE_ZIP_RE = re.compile(
    r"^\s*(?P<city>.+?)(?:,\s*|\s+)(?P<state>[A-Za-z]{2})\s+(?P<zip>\d{5}(?:-\d{4})?)\s*$"
)
_ACRES_NUMBER_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)")
_EMAIL_RE = re.compile(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b")
_PHONE_EXTRACT_RE = re.compile(r"(\+?1[\s\-\.]?)?(\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})")
_PHONE_VALID_RE = re.compile(r"^[\d\+\-\(\)\s]{10,20}$")


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _clean_required(value: Optional[str], default: str) -> str:
    return _clean(value) or default


def _parse_city_state_zip(value: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    cleaned = _clean(value)
    if not cleaned:
        return None, None, None
    match = _CITY_STATE_ZIP_RE.match(cleaned)
    if not match:
        return None, None, None
    return (
        _clean(match.group("city")),
        match.group("state").upper(),
        match.group("zip"),
    )


def _parse_acres(raw: Optional[str]) -> Optional[float]:
    cleaned = _clean(raw)
    if not cleaned:
        return None
    try:
        return float(cleaned.replace(",", ""))
    except ValueError:
        pass
    match = _ACRES_NUMBER_RE.search(cleaned.replace(",", ""))
    return float(match.group(1)) if match else None


def _normalize_email(value: Optional[str]) -> Optional[str]:
    cleaned = _clean(value)
    if not cleaned:
        return None
    match = _EMAIL_RE.search(cleaned)
    return match.group(0) if match else None


def _normalize_phone(value: Optional[str]) -> Optional[str]:
    cleaned = _clean(value)
    if not cleaned:
        return None
    if _PHONE_VALID_RE.match(cleaned):
        return cleaned
    match = _PHONE_EXTRACT_RE.search(cleaned)
    if not match:
        return None
    extracted = " ".join(match.group(0).split())
    return extracted if _PHONE_VALID_RE.match(extracted) else None


class CanonicalSWPPPMapper:
    """Maps stable canonical fields into the existing SWPPPData schema."""

    DEFAULT_STATE = "AZ"
    DEFAULT_ZIP = "00000"
    DEFAULT_COUNTY = "Unknown County"
    DEFAULT_RECEIVING_WATERS = "Unknown Receiving Waters"

    def to_swppp(self, payload: CanonicalSWPPPPayload) -> SWPPPData:
        project_city, project_state, project_zip = _parse_city_state_zip(payload.project.city_state_zip)
        city = _clean(payload.project.city) or project_city or "Unknown City"
        state = (_clean(payload.project.state) or project_state or self.DEFAULT_STATE).upper()
        zip_code = _clean(payload.project.zip) or project_zip or self.DEFAULT_ZIP

        disturbed_area = (
            payload.site.disturbed_area_acres_number
            or _parse_acres(payload.site.disturbed_area_acres)
            or payload.site.total_project_area_acres_number
            or _parse_acres(payload.site.total_project_area_acres)
            or 1.0
        )

        total_area = (
            payload.site.total_project_area_acres_number
            or _parse_acres(payload.site.total_project_area_acres)
            or disturbed_area
        )

        permit_number = self._best_non_empty(
            payload.permit.number_best_effort,
            payload.permit.azpdes_number,
            payload.permit.azcon_number,
        ) or "PENDING"

        project_end = payload.dates.project_completion
        if project_end < payload.dates.project_start:
            # Keep validation strict but avoid hard failure for occasional bad source dates.
            project_end = payload.dates.project_start + timedelta(days=1)

        project = ProjectInfo(
            project_name=payload.project.name,
            project_address=payload.project.address_line1,
            city=city,
            state=state,
            zip_code=zip_code,
            county=_clean(payload.project.county) or self.DEFAULT_COUNTY,
        )

        permit = PermitInfo(
            permit_number=permit_number,
            project_start_date=payload.dates.project_start,
            project_end_date=project_end,
            disturbed_area_acres=disturbed_area,
        )

        site_details = SiteDetails(
            intended_use_after=f"Construction activities for {payload.project.name}",
            total_property_area_acres=total_area,
            total_disturbed_area_acres=disturbed_area,
            max_disturbed_area_one_time_acres=disturbed_area,
            percent_impervious_before=0.0,
            percent_impervious_after=100.0,
            soil_type_description=_clean(payload.site.soil_types) or "Unknown Soil Type",
            is_tribal_land=False,
            is_federal_facility=False,
            has_unique_site_features=False,
            discharge_to_ms4="ms4" in (_clean(payload.site.storm_sewer_systems) or "").lower(),
        )

        owner = self._map_contact(
            name=payload.operator.contact_name,
            company=payload.operator.company,
            phone=payload.operator.phone,
            email=payload.operator.email,
            address_line1=payload.operator.address_line1,
            city_state_zip=payload.operator.city_state_zip,
        )

        contractor = self._map_contact(
            name=payload.operator.contact_name,
            company=payload.operator.company,
            phone=payload.operator.phone,
            email=payload.operator.email,
            address_line1=payload.operator.address_line1,
            city_state_zip=payload.operator.city_state_zip,
        )

        qsp = self._map_contact(
            name=payload.swppp_contact.name,
            company=payload.operator.company,
            phone=payload.swppp_contact.phone,
            email=payload.operator.email,
            address_line1=payload.operator.address_line1,
            city_state_zip=payload.operator.city_state_zip,
        )

        emergency_name = _clean(payload.emergency.contact_name) or payload.operator.contact_name
        emergency_phone = _clean(payload.emergency.phone) or payload.operator.phone
        emergency_contact = self._map_contact(
            name=emergency_name,
            company=payload.operator.company,
            phone=emergency_phone,
            email=payload.operator.email,
            address_line1=payload.operator.address_line1,
            city_state_zip=payload.operator.city_state_zip,
        )

        operator = self._map_contact(
            name=payload.operator.contact_name,
            company=payload.operator.company,
            phone=payload.operator.phone,
            email=payload.operator.email,
            address_line1=payload.operator.address_line1,
            city_state_zip=payload.operator.city_state_zip,
        )

        swppp_preparer = self._map_contact(
            name=payload.swppp_contact.name,
            company=payload.operator.company,
            phone=payload.swppp_contact.phone,
            email=payload.operator.email,
            address_line1=payload.operator.address_line1,
            city_state_zip=payload.operator.city_state_zip,
        )

        receiving_waters = (
            _clean(payload.site.receiving_waters)
            or _clean(payload.site.storm_sewer_systems)
            or self.DEFAULT_RECEIVING_WATERS
        )

        return SWPPPData(
            project=project,
            permit=permit,
            site_details=site_details,
            owner=owner,
            contractor=contractor,
            qsp=qsp,
            operator=operator,
            emergency_contact=emergency_contact,
            swppp_preparer=swppp_preparer,
            swppp_prepared_date=payload.dates.swppp_preparation_date,
            site_description=f"Construction project for {payload.project.name}.",
            receiving_waters=receiving_waters,
        )

    def _map_contact(
        self,
        *,
        name: Optional[str],
        company: Optional[str],
        phone: Optional[str],
        email: Optional[str],
        address_line1: Optional[str],
        city_state_zip: Optional[str],
    ) -> ContactInfo:
        city, state, zip_code = _parse_city_state_zip(city_state_zip)
        return ContactInfo(
            name=_clean_required(name, "Unknown Contact"),
            company=_clean_required(company, "Unknown Company"),
            phone=_normalize_phone(phone),
            email=_normalize_email(email),
            address=_clean(address_line1),
            city=city,
            state=state,
            zip_code=zip_code,
        )

    def _best_non_empty(self, *values: Optional[str]) -> Optional[str]:
        for value in values:
            cleaned = _clean(value)
            if cleaned:
                return cleaned
        return None
