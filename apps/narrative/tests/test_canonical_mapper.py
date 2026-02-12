"""Tests for deterministic canonical payload -> SWPPP mapping."""

from __future__ import annotations

import csv
from pathlib import Path
import sys

import pytest
from pydantic import ValidationError

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from app.models.canonical_swppp import CanonicalSWPPPPayload  # noqa: E402
from app.services.canonical_mapper import CanonicalSWPPPMapper  # noqa: E402


CANONICAL_DOCS_TSV = (
    BASE_DIR
    / "workflows"
    / "eva-jayson-variable-inventory"
    / "artifacts"
    / "CANONICAL_DOCS.tsv"
)


def _clean(value: str | None) -> str:
    return " ".join((value or "").split())


def _payload_from_row(row: dict[str, str]) -> dict:
    return {
        "project": {
            "name": row.get("project.name", ""),
            "address_line1": row.get("project.address_line1", ""),
            "city_state_zip": row.get("project.city_state_zip", ""),
            "city": row.get("project.city", ""),
            "state": row.get("project.state", ""),
            "zip": row.get("project.zip", ""),
            "county": row.get("project.county", ""),
        },
        "permit": {
            "azpdes_number": row.get("permit.azpdes_number", ""),
            "azcon_number": row.get("permit.azcon_number", ""),
            "number_best_effort": row.get("permit.number_best_effort", ""),
        },
        "dates": {
            "swppp_preparation_date": row.get("dates.swppp_preparation_date", ""),
            "project_start": row.get("dates.project_start", ""),
            "project_completion": row.get("dates.project_completion", ""),
        },
        "operator": {
            "company": row.get("operator.company", ""),
            "contact_name": row.get("operator.contact_name", ""),
            "phone": row.get("operator.phone", ""),
            "email": row.get("operator.email", ""),
            "address_line1": row.get("operator.address_line1", ""),
            "city_state_zip": row.get("operator.city_state_zip", ""),
        },
        "swppp_contact": {
            "name": row.get("swppp_contact.name", ""),
            "phone": row.get("swppp_contact.phone", ""),
        },
        "emergency": {
            "contact_name": row.get("emergency.contact_name", ""),
            "phone": row.get("emergency.phone", ""),
        },
        "site": {
            "total_project_area_acres": row.get("site.total_project_area_acres", ""),
            "total_project_area_acres_number": row.get("site.total_project_area_acres_number", ""),
            "disturbed_area_acres": row.get("site.disturbed_area_acres", ""),
            "disturbed_area_acres_number": row.get("site.disturbed_area_acres_number", ""),
            "soil_types": row.get("site.soil_types", ""),
            "slopes": row.get("site.slopes", ""),
            "receiving_waters": row.get("site.receiving_waters", ""),
            "storm_sewer_systems": row.get("site.storm_sewer_systems", ""),
        },
        "bmp": {
            "ec7": {
                "responsible_staff": row.get("bmp.ec7.responsible_staff", ""),
                "installation_schedule": row.get("bmp.ec7.installation_schedule", ""),
                "maintenance": row.get("bmp.ec7.maintenance", ""),
            }
        },
    }


def test_canonical_mapper_maps_core_fields():
    mapper = CanonicalSWPPPMapper()
    payload = CanonicalSWPPPPayload.model_validate(
        {
            "project": {
                "name": "Novel Heritage Park",
                "address_line1": "SWC West Juniper Ave & N Gilbert Rd",
                "city_state_zip": "Gilbert, AZ 85297",
                "county": "Pima",
            },
            "permit": {
                "azpdes_number": "109413",
                "number_best_effort": "109413",
            },
            "dates": {
                "swppp_preparation_date": "05/22/2025",
                "project_start": "05/15/2025",
                "project_completion": "06/30/2025",
            },
            "operator": {
                "company": "Colorado Structures, Inc.",
                "contact_name": "David Tang",
                "phone": "602-284-1346",
                "email": "dtang@csigc.com",
                "address_line1": "10565 N 114th St, STE 100",
                "city_state_zip": "Scottsdale, AZ 85259",
            },
            "swppp_contact": {
                "name": "David Tang",
                "phone": "602-284-1346",
            },
            "emergency": {
                "contact_name": "David Tang",
                "phone": "602-284-1346",
            },
            "site": {
                "total_project_area_acres": "12 Acres",
                "disturbed_area_acres": "12 Acres",
                "soil_types": "Contine Clay Loam",
                "receiving_waters": "Unknown Ephemeral Tributary",
                "storm_sewer_systems": "City of Gilbert MS4",
            },
        }
    )

    swppp = mapper.to_swppp(payload)
    assert swppp.project.project_name == "Novel Heritage Park"
    assert swppp.project.city == "Gilbert"
    assert swppp.project.state == "AZ"
    assert swppp.project.zip_code == "85297"
    assert swppp.permit.permit_number == "109413"
    assert swppp.permit.disturbed_area_acres == pytest.approx(12.0)
    assert swppp.owner.name == "David Tang"
    assert swppp.qsp.name == "David Tang"
    assert swppp.site_details.discharge_to_ms4 is True


def test_canonical_mapper_regression_against_canonical_docs_tsv():
    mapper = CanonicalSWPPPMapper()
    assert CANONICAL_DOCS_TSV.exists(), f"Missing fixture: {CANONICAL_DOCS_TSV}"

    rows = list(csv.DictReader(CANONICAL_DOCS_TSV.open("r", encoding="utf-8"), delimiter="\t"))
    assert len(rows) >= 190, "Expected the canonical fixture to include the corpus rows"

    mapped_count = 0
    skipped_validation = 0
    mapping_failures: list[str] = []

    for row in rows:
        payload_raw = _payload_from_row(row)
        try:
            payload = CanonicalSWPPPPayload.model_validate(payload_raw)
        except ValidationError:
            skipped_validation += 1
            continue

        try:
            swppp = mapper.to_swppp(payload)
        except Exception as exc:  # pragma: no cover - explicit regression guard
            mapping_failures.append(f"{row.get('doc_id', '<unknown>')}: {exc}")
            continue

        mapped_count += 1

        assert swppp.project.project_name == payload.project.name
        assert swppp.project.project_address == payload.project.address_line1
        assert swppp.swppp_prepared_date == payload.dates.swppp_preparation_date
        assert swppp.permit.project_start_date == payload.dates.project_start
        assert swppp.permit.project_end_date >= swppp.permit.project_start_date

        expected_permit = (
            _clean(row.get("permit.number_best_effort"))
            or _clean(row.get("permit.azpdes_number"))
            or _clean(row.get("permit.azcon_number"))
            or "PENDING"
        )
        assert swppp.permit.permit_number == expected_permit

        disturbed_number_raw = _clean(row.get("site.disturbed_area_acres_number"))
        if disturbed_number_raw:
            assert swppp.permit.disturbed_area_acres == pytest.approx(float(disturbed_number_raw))

    assert not mapping_failures, "Unexpected canonical mapping failures:\n" + "\n".join(mapping_failures[:20])
    # A few rows are expected to be skipped due to missing required canonical values.
    assert mapped_count >= 180
    assert skipped_validation <= 30
