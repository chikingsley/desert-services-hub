"""Tests for deterministic source extraction -> canonical payload builder."""

from __future__ import annotations

import csv
from datetime import date, datetime
from pathlib import Path
import sys

import pytest

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

CANONICAL_DOCS_TSV = (
    BASE_DIR
    / "workflows"
    / "eva-jayson-variable-inventory"
    / "artifacts"
    / "CANONICAL_DOCS.tsv"
)

from app.models.canonical_swppp import CanonicalSWPPPPayload  # noqa: E402
from app.models.swppp_variables import EstimateExtraction, NOIExtraction, StormPlanExtraction  # noqa: E402
from app.services.canonical_builder import CanonicalPayloadBuilder  # noqa: E402


def test_builder_from_structured_models():
    builder = CanonicalPayloadBuilder()

    estimate = EstimateExtraction(
        client_company="Colorado Structures, Inc.",
        client_contact="David Tang",
        client_address="10565 N 114th St, STE 100",
        client_phone="602-284-1346",
        job_name="Novel Heritage Park",
        job_location="SWC West Juniper Ave & N Gilbert Rd",
        estimate_date=date(2025, 5, 22),
        inspection_schedule="Weekly and after rain events",
    )

    storm_plan = StormPlanExtraction(
        project_name="Novel Heritage Park",
        project_address="SWC West Juniper Ave & N Gilbert Rd",
        city="Gilbert",
        state="AZ",
        zip_code="85297",
        county="Pima",
        site_area_acres=12.0,
        total_disturbed_area_acres=12.0,
        soil_type_description="Contine Clay Loam",
        receiving_water="City of Gilbert MS4",
    )

    noi = NOIExtraction(
        azpdes_number="109413",
        project_start_date=date(2025, 5, 15),
        project_end_date=date(2025, 6, 30),
    )

    payload = builder.build(estimate=estimate, storm_plan=storm_plan, noi=noi)
    assert isinstance(payload, CanonicalSWPPPPayload)
    assert payload.project.name == "Novel Heritage Park"
    assert payload.project.city == "Gilbert"
    assert payload.permit.number_best_effort == "109413"
    assert payload.dates.project_start == date(2025, 5, 15)
    assert payload.operator.company == "Colorado Structures, Inc."
    assert payload.operator.contact_name == "David Tang"
    assert payload.operator.phone == "602-284-1346"
    assert payload.site.total_project_area_acres_number == pytest.approx(12.0)
    assert payload.site.disturbed_area_acres_number == pytest.approx(12.0)
    assert payload.bmp.ec7.installation_schedule == "Weekly and after rain events"


def test_builder_coerces_noi_dict_with_pdf_analysis_fields():
    builder = CanonicalPayloadBuilder()

    payload = builder.build(
        storm_plan={
            "project_name": "One Scottsdale",
            "project_address": "7370 E Henkel Way",
            "city": "Scottsdale",
            "state": "AZ",
            "zip_code": "85255",
            "county": "Maricopa",
            "site_area_acres": 3.14,
            "total_disturbed_area_acres": 3.14,
            "soil_type_description": "Gilman Loams",
            "receiving_water": "Indian Bend Wash",
        },
        estimate={
            "client_company": "MT Builders LLC",
            "client_contact": "Gavin Morgan",
            "client_phone": "602-525-6036",
            "job_name": "MMA One Scottsdale",
            "job_location": "7370 E Henkel Way",
            "estimate_date": "2025-12-17",
            "inspection_schedule": None,
        },
        noi={
            "permitId": "113724",
            "ltfNumber": "113724",
            "siteName": "One Scottsdale",
            "siteAddress": "7370 E Henkel Way, Scottsdale, AZ 85255",
            "applicantName": "MT Builders LLC",
            "swpppContactFirstName": "Gavin",
            "swpppContactLastName": "Morgan",
            "swpppContactEmail": "gavin@mtbuilders.com",
            "swpppContactPhone": "(602) 525-6036",
            "projectStartDate": "2025-12-02",
            "projectEndDate": "2030-08-28",
        },
    )

    assert payload.permit.number_best_effort == "113724"
    assert payload.dates.project_start == date(2025, 12, 2)
    assert payload.dates.project_completion == date(2030, 8, 28)
    assert payload.project.city_state_zip == "Scottsdale, AZ 85255"
    assert payload.operator.company == "MT Builders LLC"
    assert payload.operator.contact_name == "Gavin Morgan"
    assert payload.site.soil_types == "Gilman Loams"
    assert payload.swppp_contact.name == "Gavin Morgan"
    assert payload.swppp_contact.phone == "(602) 525-6036"
    assert payload.operator.email == "gavin@mtbuilders.com"


def test_builder_noi_only_uses_noi_site_and_swppp_contact_fallbacks():
    builder = CanonicalPayloadBuilder()

    payload = builder.build(
        noi={
            "permitId": "AZC110781",
            "ltfNumber": "110781",
            "siteName": "Lofts @ G-Diamond",
            "siteAddress": "1904 N COLORADO ST, CASA GRANDE, AZ 85122",
            "applicantName": "CG LOFTS COLORADO, LLC",
            "applicantAddress1": "1950 N 2200 W, SUITE 900",
            "applicantCity": "SALT LAKE CITY",
            "applicantState": "UT",
            "applicantZip": "84116",
            "swpppContactFirstName": "Jared",
            "swpppContactLastName": "Aiken",
            "swpppContactEmail": "jared@desertservices.net",
            "swpppContactPhone": "9893307859",
            "acresDisturbed": 10.2,
            "projectStartDate": "2025-08-29",
            "projectEndDate": "2030-08-28",
        }
    )

    assert payload.project.name == "Lofts @ G-Diamond"
    assert payload.project.address_line1 == "1904 N COLORADO ST"
    assert payload.project.city_state_zip == "CASA GRANDE, AZ 85122"
    assert payload.project.city == "CASA GRANDE"
    assert payload.project.state == "AZ"
    assert payload.project.zip == "85122"
    assert payload.permit.number_best_effort == "110781"
    assert payload.operator.company == "CG LOFTS COLORADO, LLC"
    assert payload.operator.contact_name == "Jared Aiken"
    assert payload.operator.email == "jared@desertservices.net"
    assert payload.swppp_contact.name == "Jared Aiken"
    assert payload.site.disturbed_area_acres_number == pytest.approx(10.2)


def test_builder_prefers_noi_identity_over_estimate_when_both_present():
    builder = CanonicalPayloadBuilder()

    payload = builder.build(
        estimate={
            "client_company": "Wrong Estimate Company",
            "client_contact": "Wrong Estimate Contact",
            "client_phone": "480-555-1212",
            "job_name": "Wrong Estimate Project",
            "job_location": "1 Wrong Way, Phoenix, AZ",
            "estimate_date": "2025-08-19",
        },
        noi={
            "permitId": "AZC110781",
            "ltfNumber": "110781",
            "siteName": "Lofts @ G-Diamond",
            "siteAddress": "1904 N COLORADO ST, CASA GRANDE, AZ 85122",
            "applicantName": "CG LOFTS COLORADO, LLC",
            "swpppContactFirstName": "Jared",
            "swpppContactLastName": "Aiken",
            "swpppContactEmail": "jared@desertservices.net",
            "swpppContactPhone": "(989) 330-7859",
            "issuedDate": "08/29/2025",
            "expirationDate": "08/28/2030",
        },
    )

    assert payload.project.name == "Lofts @ G-Diamond"
    assert payload.project.address_line1 == "1904 N COLORADO ST"
    assert payload.operator.company == "CG LOFTS COLORADO, LLC"
    assert payload.operator.contact_name == "Jared Aiken"
    assert payload.operator.email == "jared@desertservices.net"
    assert payload.dates.project_start == date(2025, 8, 29)
    assert payload.dates.project_completion == date(2030, 8, 28)


def test_builder_ignores_unknown_noi_values_for_project_fallback():
    builder = CanonicalPayloadBuilder()

    payload = builder.build(
        estimate={
            "job_name": "Fallback Estimate Project",
            "job_location": "100 Main St",
            "estimate_date": "2025-08-19",
        },
        noi={
            "siteName": "UNKNOWN",
            "siteAddress": "UNKNOWN ADDRESS",
            "permitId": "AZC123456",
            "ltfNumber": "123456",
        },
    )

    assert payload.project.name == "Fallback Estimate Project"
    assert payload.project.address_line1 == "100 Main St"


def test_builder_uses_swppp_preparation_date_override():
    builder = CanonicalPayloadBuilder()

    payload = builder.build(
        estimate={"estimate_date": "2025-08-19"},
        noi={"permitId": "AZC123456", "ltfNumber": "123456"},
        swppp_preparation_date="2026-01-06",
    )

    assert payload.dates.swppp_preparation_date == date(2026, 1, 6)


def _parse_mdy(raw: str | None) -> date:
    if not raw:
        raise ValueError("missing date")
    return datetime.strptime(raw.strip(), "%m/%d/%Y").date()


def test_builder_regression_from_canonical_rows():
    builder = CanonicalPayloadBuilder()
    rows = list(csv.DictReader(CANONICAL_DOCS_TSV.open("r", encoding="utf-8"), delimiter="\t"))
    assert len(rows) >= 190

    checked = 0
    for row in rows:
        project_name = (row.get("project.name") or "").strip()
        project_address = (row.get("project.address_line1") or "").strip()
        operator_company = (row.get("operator.company") or "").strip()
        operator_name = (row.get("operator.contact_name") or "").strip()
        operator_phone = (row.get("operator.phone") or "").strip()
        permit_number = (row.get("permit.number_best_effort") or "").strip()
        prep_date = (row.get("dates.swppp_preparation_date") or "").strip()
        start_date = (row.get("dates.project_start") or "").strip()
        end_date = (row.get("dates.project_completion") or "").strip()

        if not all(
            [
                project_name,
                project_address,
                operator_company,
                operator_name,
                operator_phone,
                prep_date,
                start_date,
                end_date,
            ]
        ):
            continue

        payload = builder.build(
            estimate={
                "client_company": operator_company,
                "client_contact": operator_name,
                "client_phone": operator_phone,
                "client_address": row.get("operator.address_line1", ""),
                "job_name": project_name,
                "job_location": project_address,
                "estimate_date": _parse_mdy(prep_date).isoformat(),
            },
            storm_plan={
                "project_name": project_name,
                "project_address": project_address,
                "city": row.get("project.city", ""),
                "state": row.get("project.state", ""),
                "zip_code": row.get("project.zip", ""),
                "county": row.get("project.county", ""),
                "site_area_acres": row.get("site.total_project_area_acres_number", "") or None,
                "total_disturbed_area_acres": row.get("site.disturbed_area_acres_number", "") or None,
                "soil_type_description": row.get("site.soil_types", ""),
                "receiving_water": row.get("site.receiving_waters", ""),
            },
            noi={
                "azpdes_number": permit_number,
                "project_start_date": _parse_mdy(start_date).isoformat(),
                "project_end_date": _parse_mdy(end_date).isoformat(),
            },
        )

        assert payload.project.name == project_name
        assert payload.project.address_line1 == project_address
        assert payload.operator.company == operator_company
        assert payload.operator.contact_name == operator_name
        assert payload.operator.phone == operator_phone
        assert payload.dates.project_start == _parse_mdy(start_date)
        assert payload.dates.project_completion == _parse_mdy(end_date)
        if permit_number:
            assert payload.permit.number_best_effort == permit_number

        checked += 1
        if checked >= 80:
            break

    assert checked >= 60
