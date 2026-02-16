"""Deterministic builder from extracted source docs -> canonical SWPPP payload."""

from __future__ import annotations

from datetime import date, timedelta
import re
from typing import Any, Optional

from app.models.canonical_swppp import (
    CanonicalBMP,
    CanonicalBMPec7,
    CanonicalDates,
    CanonicalEmergencyContact,
    CanonicalOperatorContact,
    CanonicalPermit,
    CanonicalProject,
    CanonicalSite,
    CanonicalSWPPPPayload,
    CanonicalSWPPPContact,
)
from app.models.swppp_variables import EstimateExtraction, NOIExtraction, StormPlanExtraction


_CITY_STATE_ZIP_RE = re.compile(
    r"^\s*(?P<city>.+?)(?:,\s*|\s+)(?P<state>[A-Za-z]{2})\s+(?P<zip>\d{5}(?:-\d{4})?)\s*$"
)
_ADDRESS_CITY_STATE_ZIP_RE = re.compile(
    r"^\s*(?P<line1>[^,]+)\s*,\s*(?P<city>[^,]+)\s*,\s*(?P<state>[A-Za-z]{2})\s+(?P<zip>\d{5}(?:-\d{4})?)\s*$"
)
_EMAIL_RE = re.compile(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b")
_PHONE_RE = re.compile(r"(\+?1[\s\-\.]?)?(\(?\d{3}\)?[\s\-\.]?\d{3}[\s\-\.]?\d{4})")


class CanonicalPayloadBuilder:
    """Build canonical payload from estimate/storm plan/NOI extraction objects."""

    DEFAULT_STATE = "AZ"
    DEFAULT_ZIP = "00000"
    DEFAULT_COUNTY = "Maricopa"
    DEFAULT_PHONE = "000-000-0000"
    DEFAULT_CONTACT_NAME = "Unknown Contact"
    DEFAULT_COMPANY = "Unknown Company"
    SENTINEL_VALUES = {
        "unknown",
        "unknown address",
        "unknown contact",
        "unknown company",
        "n/a",
        "na",
        "none",
        "null",
        "pending",
    }

    def build(
        self,
        *,
        estimate: EstimateExtraction | dict[str, Any] | None = None,
        storm_plan: StormPlanExtraction | dict[str, Any] | None = None,
        noi: NOIExtraction | dict[str, Any] | None = None,
        swppp_preparation_date: date | str | None = None,
    ) -> CanonicalSWPPPPayload:
        estimate_model = self._coerce_estimate(estimate)
        storm_model = self._coerce_storm_plan(storm_plan)
        noi_model = self._coerce_noi(noi)
        noi_site_name = self._extract_noi_site_name(noi)
        noi_site_address = self._extract_noi_site_address(noi)
        noi_address_line1, noi_address_city, noi_address_state, noi_address_zip = (
            self._parse_site_address(noi_site_address)
        )
        noi_city_state_zip = self._build_city_state_zip(
            city=noi_address_city or self._extract_noi_site_city(noi),
            state=noi_address_state or self._extract_noi_site_state(noi),
            zip_code=noi_address_zip or self._extract_noi_site_zip(noi),
        )
        noi_applicant_name = self._extract_noi_applicant_name(noi)
        noi_applicant_address = self._extract_noi_applicant_address(noi)
        noi_applicant_city_state_zip = self._build_city_state_zip(
            city=self._extract_noi_site_city(noi),
            state=self._extract_noi_site_state(noi),
            zip_code=self._extract_noi_site_zip(noi),
        )
        noi_swppp_contact_name = self._extract_noi_swppp_contact_name(noi)
        noi_swppp_contact_phone = self._extract_phone(self._extract_noi_swppp_contact_phone(noi))
        noi_swppp_contact_email = self._extract_email(self._extract_noi_swppp_contact_email(noi))
        noi_disturbed_acres = self._extract_noi_disturbed_acres(noi)

        project_name = self._best(
            noi_site_name,
            storm_model.project_name if storm_model else None,
            estimate_model.job_name if estimate_model else None,
        ) or "Unknown Project"

        address_line1 = self._best(
            noi_address_line1,
            noi_site_address,
            storm_model.project_address if storm_model else None,
            estimate_model.job_location if estimate_model else None,
        ) or "Unknown Address"

        city_state_zip = noi_city_state_zip or self._build_city_state_zip(
            city=storm_model.city if storm_model else None,
            state=storm_model.state if storm_model else None,
            zip_code=storm_model.zip_code if storm_model else None,
        )

        city, state, zip_code = self._parse_city_state_zip(city_state_zip)
        if city is None:
            city = noi_address_city
        if state is None:
            state = noi_address_state or self.DEFAULT_STATE
        if zip_code is None:
            zip_code = noi_address_zip or self.DEFAULT_ZIP

        county = self._normalize_county(storm_model.county if storm_model else None) or self.DEFAULT_COUNTY

        permit_number = self._normalize_permit_number(
            self._best(
                noi_model.azpdes_number if noi_model else None,
                self._extract_noi_permit_id(noi),
            )
        )

        start_date = (
            noi_model.project_start_date
            if noi_model and noi_model.project_start_date
            else estimate_model.estimate_date if estimate_model else None
        ) or date.today()

        completion_date = (
            noi_model.project_end_date
            if noi_model and noi_model.project_end_date
            else start_date + timedelta(days=365)
        )

        if completion_date < start_date:
            completion_date = start_date + timedelta(days=1)

        prep_date_override = self._parse_date_str(swppp_preparation_date)
        if prep_date_override is not None:
            prep_date = prep_date_override
        elif estimate_model and estimate_model.estimate_date:
            prep_date = estimate_model.estimate_date
        else:
            prep_date = start_date

        operator_company = self._best(
            noi_applicant_name,
            estimate_model.client_company if estimate_model else None,
            storm_model.owner if storm_model else None,
            storm_model.developer if storm_model else None,
        ) or self.DEFAULT_COMPANY

        operator_name = self._best(
            noi_swppp_contact_name,
            estimate_model.client_contact if estimate_model else None,
            storm_model.owner if storm_model else None,
            storm_model.civil_engineer_contact if storm_model else None,
        ) or self.DEFAULT_CONTACT_NAME

        operator_phone = self._extract_phone(
            self._best(
                estimate_model.client_phone if estimate_model else None,
                noi_swppp_contact_phone,
            )
        ) or self.DEFAULT_PHONE

        operator_email = (
            noi_swppp_contact_email
            or self._extract_email(estimate_model.client_contact if estimate_model else None)
            or self._extract_email(estimate_model.client_address if estimate_model else None)
        )

        disturbed_area = (
            storm_model.total_disturbed_area_acres
            if storm_model and storm_model.total_disturbed_area_acres
            else noi_disturbed_acres
        )
        total_area = (
            storm_model.site_area_acres
            if storm_model and storm_model.site_area_acres
            else disturbed_area
        )

        site = CanonicalSite(
            total_project_area_acres=f"{total_area} Acres" if total_area else None,
            total_project_area_acres_number=total_area,
            disturbed_area_acres=f"{disturbed_area} Acres" if disturbed_area else None,
            disturbed_area_acres_number=disturbed_area,
            soil_types=self._best(storm_model.soil_type_description if storm_model else None),
            slopes=self._best(storm_model.slopes_description if storm_model else None),
            receiving_waters=self._best(storm_model.receiving_water if storm_model else None),
            storm_sewer_systems=(
                self._best(storm_model.storm_sewer_systems if storm_model else None)
                or self._infer_storm_sewer(storm_model.receiving_water if storm_model else None)
            ),
        )

        bmp = CanonicalBMP(
            ec7=CanonicalBMPec7(
                responsible_staff=operator_company,
                installation_schedule=self._estimate_installation_schedule(estimate_model),
                maintenance=self._estimate_maintenance(estimate_model),
            )
        )

        payload = CanonicalSWPPPPayload(
            project=CanonicalProject(
                name=project_name,
                address_line1=address_line1,
                city_state_zip=city_state_zip,
                city=city,
                state=state,
                zip=zip_code,
                county=county,
            ),
            permit=CanonicalPermit(
                azpdes_number=permit_number,
                azcon_number=None,
                number_best_effort=permit_number,
            ),
            dates=CanonicalDates(
                swppp_preparation_date=prep_date,
                project_start=start_date,
                project_completion=completion_date,
            ),
            operator=CanonicalOperatorContact(
                company=operator_company,
                contact_name=operator_name,
                phone=operator_phone,
                email=operator_email,
                address_line1=self._best(noi_applicant_address, estimate_model.client_address if estimate_model else None),
                city_state_zip=noi_applicant_city_state_zip,
            ),
            swppp_contact=CanonicalSWPPPContact(
                name=self._best(noi_swppp_contact_name, operator_name) or self.DEFAULT_CONTACT_NAME,
                phone=self._best(noi_swppp_contact_phone, operator_phone) or self.DEFAULT_PHONE,
            ),
            emergency=CanonicalEmergencyContact(
                contact_name=self._best(noi_swppp_contact_name, operator_name),
                phone=self._best(noi_swppp_contact_phone, operator_phone),
            ),
            site=site,
            bmp=bmp,
        )

        return payload

    def _coerce_estimate(
        self,
        value: EstimateExtraction | dict[str, Any] | None,
    ) -> Optional[EstimateExtraction]:
        if value is None:
            return None
        if isinstance(value, EstimateExtraction):
            return value
        if isinstance(value, dict):
            return EstimateExtraction.model_validate(value)
        raise TypeError(f"Unsupported estimate type: {type(value).__name__}")

    def _coerce_storm_plan(
        self,
        value: StormPlanExtraction | dict[str, Any] | None,
    ) -> Optional[StormPlanExtraction]:
        if value is None:
            return None
        if isinstance(value, StormPlanExtraction):
            return value
        if isinstance(value, dict):
            return StormPlanExtraction.model_validate(value)
        raise TypeError(f"Unsupported storm_plan type: {type(value).__name__}")

    def _coerce_noi(
        self,
        value: NOIExtraction | dict[str, Any] | None,
    ) -> Optional[NOIExtraction]:
        if value is None:
            return None
        if isinstance(value, NOIExtraction):
            return value
        if isinstance(value, dict):
            normalized = dict(value)
            if not normalized.get("azpdes_number"):
                permit_id = self._extract_noi_permit_id(normalized)
                if permit_id:
                    normalized["azpdes_number"] = permit_id
            if not normalized.get("project_start_date"):
                normalized["project_start_date"] = self._parse_date_str(
                    self._best(
                        normalized.get("project_start_date"),
                        normalized.get("projectStartDate"),
                        normalized.get("issuedDate"),
                        normalized.get("issued_date"),
                        normalized.get("issued"),
                    )
                )
            if not normalized.get("project_end_date"):
                normalized["project_end_date"] = self._parse_date_str(
                    self._best(
                        normalized.get("project_end_date"),
                        normalized.get("projectEndDate"),
                        normalized.get("expirationDate"),
                        normalized.get("expiration_date"),
                        normalized.get("expiration"),
                        normalized.get("expires"),
                    )
                )
            return NOIExtraction.model_validate(normalized)
        raise TypeError(f"Unsupported noi type: {type(value).__name__}")

    def _extract_noi_permit_id(self, value: dict[str, Any] | Any | None) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, dict):
            return self._best(
                value.get("ltf_number"),
                value.get("ltfNumber"),
                value.get("permit_id"),
                value.get("permitId"),
            )
        return self._best(getattr(value, "ltf_number", None), getattr(value, "permit_id", None))

    def _parse_date_str(self, value: Any) -> Optional[date]:
        if value is None:
            return None
        if isinstance(value, date):
            return value
        if not isinstance(value, str):
            return None
        raw = value.strip()
        if not raw:
            return None
        if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
            return date.fromisoformat(raw)
        mdy_match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", raw)
        if mdy_match:
            month, day, year = (int(mdy_match.group(i)) for i in (1, 2, 3))
            return date(year, month, day)
        return None

    def _build_city_state_zip(
        self,
        *,
        city: Optional[str],
        state: Optional[str],
        zip_code: Optional[str],
    ) -> Optional[str]:
        c = self._best(city)
        s = self._best(state) or self.DEFAULT_STATE
        z = self._best(zip_code) or self.DEFAULT_ZIP
        if not c:
            return None
        return f"{c}, {s.upper()} {z}"

    def _parse_city_state_zip(
        self,
        value: Optional[str],
    ) -> tuple[Optional[str], Optional[str], Optional[str]]:
        if not value:
            return None, None, None
        match = _CITY_STATE_ZIP_RE.match(value.strip())
        if not match:
            return None, None, None
        return (
            match.group("city").strip(),
            match.group("state").upper(),
            match.group("zip"),
        )

    def _parse_site_address(
        self,
        value: Optional[str],
    ) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
        raw = self._best(value)
        if raw is None:
            return None, None, None, None
        match = _ADDRESS_CITY_STATE_ZIP_RE.match(raw)
        if not match:
            if "," in raw:
                parts = [self._best(part) for part in raw.split(",")]
                line1 = parts[0] if parts else None
                city = parts[1] if len(parts) > 1 else None
                state = None
                zip_code = None
                if len(parts) > 2 and parts[2]:
                    state_zip = re.match(r"^\s*([A-Za-z]{2})(?:\s+(\d{5}(?:-\d{4})?))?\s*$", parts[2])
                    if state_zip:
                        state = state_zip.group(1).upper()
                        zip_code = state_zip.group(2)
                if line1 and self._looks_like_city_state_only(line1):
                    line1 = None
                return line1, city, state, zip_code
            return raw, None, None, None
        return (
            self._best(match.group("line1")),
            self._best(match.group("city")),
            self._best(match.group("state")),
            self._best(match.group("zip")),
        )

    def _looks_like_city_state_only(self, value: str) -> bool:
        raw = " ".join(value.split())
        return bool(re.match(r"^[A-Za-z .'-]+,\s*[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$", raw))

    def _infer_storm_sewer(self, receiving_water: Optional[str]) -> Optional[str]:
        text = (receiving_water or "").strip()
        if not text:
            return None
        if "ms4" in text.lower():
            return text
        return f"{text} (MS4 Unknown)"

    def _normalize_county(self, value: Optional[str]) -> Optional[str]:
        county = self._best(value)
        if county is None:
            return None
        if "county" not in county.lower():
            return None
        return county

    def _extract_email(self, text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        match = _EMAIL_RE.search(text)
        return match.group(0) if match else None

    def _extract_phone(self, text: Optional[str]) -> Optional[str]:
        if not text:
            return None
        match = _PHONE_RE.search(text)
        if not match:
            return None
        return " ".join(match.group(0).split())

    def _estimate_installation_schedule(self, estimate: Optional[EstimateExtraction]) -> str:
        if estimate and estimate.inspection_schedule:
            return estimate.inspection_schedule
        return "During all grading & Excavating."

    def _estimate_maintenance(self, estimate: Optional[EstimateExtraction]) -> str:
        _ = estimate
        return "Stabilization will be done daily as needed."

    def _normalize_permit_number(self, value: Optional[str]) -> Optional[str]:
        raw = self._best(value)
        if not raw:
            return None
        match = re.search(r"(\d{5,})", raw)
        if match:
            return match.group(1)
        return raw

    def _extract_noi_site_name(self, value: NOIExtraction | dict[str, Any] | None) -> Optional[str]:
        return self._extract_noi_field(value, "site_name", "siteName")

    def _extract_noi_site_address(self, value: NOIExtraction | dict[str, Any] | None) -> Optional[str]:
        return self._extract_noi_field(value, "site_address", "siteAddress")

    def _extract_noi_site_city(self, value: NOIExtraction | dict[str, Any] | None) -> Optional[str]:
        return self._extract_noi_field(value, "applicant_city", "applicantCity")

    def _extract_noi_site_state(self, value: NOIExtraction | dict[str, Any] | None) -> Optional[str]:
        return self._extract_noi_field(value, "applicant_state", "applicantState")

    def _extract_noi_site_zip(self, value: NOIExtraction | dict[str, Any] | None) -> Optional[str]:
        return self._extract_noi_field(value, "applicant_zip", "applicantZip")

    def _extract_noi_applicant_name(self, value: NOIExtraction | dict[str, Any] | None) -> Optional[str]:
        return self._extract_noi_field(value, "applicant_name", "applicantName")

    def _extract_noi_applicant_address(
        self,
        value: NOIExtraction | dict[str, Any] | None,
    ) -> Optional[str]:
        return self._best(
            self._extract_noi_field(value, "applicant_address1", "applicantAddress1"),
            self._extract_noi_field(value, "applicant_address2", "applicantAddress2"),
        )

    def _extract_noi_swppp_contact_name(
        self,
        value: NOIExtraction | dict[str, Any] | None,
    ) -> Optional[str]:
        return self._best(
            self._extract_noi_field(value, "swppp_contact_name", "swpppContactName"),
            " ".join(
                part
                for part in [
                    self._extract_noi_field(value, "swppp_contact_first_name", "swpppContactFirstName"),
                    self._extract_noi_field(value, "swppp_contact_last_name", "swpppContactLastName"),
                ]
                if part
            ),
        )

    def _extract_noi_swppp_contact_email(
        self,
        value: NOIExtraction | dict[str, Any] | None,
    ) -> Optional[str]:
        return self._extract_noi_field(value, "swppp_contact_email", "swpppContactEmail")

    def _extract_noi_swppp_contact_phone(
        self,
        value: NOIExtraction | dict[str, Any] | None,
    ) -> Optional[str]:
        return self._extract_noi_field(value, "swppp_contact_phone", "swpppContactPhone")

    def _extract_noi_disturbed_acres(
        self,
        value: NOIExtraction | dict[str, Any] | None,
    ) -> Optional[float]:
        raw = self._extract_noi_field(value, "acres_disturbed", "acresDisturbed")
        if raw is None:
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    def _extract_noi_field(
        self,
        value: NOIExtraction | dict[str, Any] | None,
        *keys: str,
    ) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, dict):
            return self._best(*(value.get(key) for key in keys))
        return self._best(*(getattr(value, key, None) for key in keys))

    def _best(self, *values: Optional[str]) -> Optional[str]:
        for value in values:
            if value is None:
                continue
            cleaned = " ".join(str(value).split())
            if cleaned and cleaned.lower() not in self.SENTINEL_VALUES:
                return cleaned
        return None
