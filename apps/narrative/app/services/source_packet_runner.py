"""Run deterministic narrative generation from source packet attachments."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import json
from pathlib import Path
import re
import subprocess
import tempfile
from typing import Any, Optional

from app.models.canonical_swppp import CanonicalSWPPPPayload
from app.models.swppp import SWPPPData
from app.services.canonical_builder import CanonicalPayloadBuilder
from app.services.canonical_mapper import CanonicalSWPPPMapper
from app.services.document_generator import DocumentGenerator


_ISSUED_DATE_RE = re.compile(r"Issued:\s*(\d{1,2}/\d{1,2}/\d{4})", re.IGNORECASE)
_EXPIRATION_DATE_RE = re.compile(
    r"Expiration Date:\s*(\d{1,2}/\d{1,2}/\d{4})", re.IGNORECASE
)
_SECTION_END_RE = re.compile(r"(?:\n##\s+[A-Z]|<!-- Page|\n---\s*Page)", re.IGNORECASE)
_AZ_COUNTIES = (
    "Apache",
    "Cochise",
    "Coconino",
    "Gila",
    "Graham",
    "Greenlee",
    "La Paz",
    "Maricopa",
    "Mohave",
    "Navajo",
    "Pima",
    "Pinal",
    "Santa Cruz",
    "Yavapai",
    "Yuma",
)


@dataclass
class SourcePacketInputs:
    packet_id: str
    doc_id: str
    packet_dir: Path
    estimate_pdf: Optional[Path]
    noi_pdf: Optional[Path]
    plan_pdf: Optional[Path]
    narrative_received_date: Optional[date]


@dataclass
class SourcePacketRunResult:
    packet_id: str
    doc_id: str
    payload: CanonicalSWPPPPayload
    swppp: SWPPPData
    estimate: dict[str, Any] | None
    noi: dict[str, Any] | None


class SourcePacketRunner:
    """Deterministic packet runner for NOI + estimate + mapper/generator flow."""

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root.resolve()
        self.builder = CanonicalPayloadBuilder()
        self.mapper = CanonicalSWPPPMapper()
        self.template_path = (
            self.repo_root / "apps" / "narrative" / "templates" / "cgp_p3_template.docx"
        )

    def run(self, inputs: SourcePacketInputs) -> SourcePacketRunResult:
        estimate = self._extract_estimate(inputs)
        noi = self._extract_noi(inputs)
        storm_plan = self._extract_storm_plan(inputs)

        payload = self.builder.build(
            estimate=estimate,
            storm_plan=storm_plan,
            noi=noi,
            swppp_preparation_date=inputs.narrative_received_date,
        )
        swppp = self.mapper.to_swppp(payload)

        return SourcePacketRunResult(
            packet_id=inputs.packet_id,
            doc_id=inputs.doc_id,
            payload=payload,
            swppp=swppp,
            estimate=estimate,
            noi=noi,
        )

    def generate_document(self, swppp: SWPPPData, output_path: Path) -> Path:
        generator = DocumentGenerator(self.template_path)
        return generator.generate_swppp(swppp, output_path)

    def load_inputs(self, pair: dict[str, Any]) -> SourcePacketInputs:
        packet_id = str(pair.get("packet_id") or "").strip()
        doc_id = str(pair.get("doc_id") or "").strip()
        if not packet_id or not doc_id:
            raise ValueError("Pair is missing required keys: packet_id/doc_id")

        packet_dir = (
            self.repo_root
            / "apps"
            / "narrative"
            / "data"
            / "intake"
            / "eva-to-jayson"
            / "source-packets"
            / packet_id
        )
        packet_json_path = packet_dir / "packet.json"
        if not packet_json_path.exists():
            raise FileNotFoundError(f"Missing packet.json: {packet_json_path}")

        packet = json.loads(packet_json_path.read_text(encoding="utf-8"))
        selected = packet.get("selected", {}) if isinstance(packet, dict) else {}

        estimate_pdf = self._resolve_repo_path(
            self._nested_get(selected, "estimate", "downloaded_path")
        )
        noi_pdf = self._resolve_repo_path(self._nested_get(selected, "noi", "downloaded_path"))
        plan_pdf = self._resolve_repo_path(
            self._nested_get(selected, "plan", "downloaded_path")
        )

        return SourcePacketInputs(
            packet_id=packet_id,
            doc_id=doc_id,
            packet_dir=packet_dir,
            estimate_pdf=estimate_pdf,
            noi_pdf=noi_pdf,
            plan_pdf=plan_pdf,
            narrative_received_date=self._parse_narrative_received_date(pair),
        )

    def _nested_get(self, root: Any, *keys: str) -> Optional[str]:
        current = root
        for key in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        if current is None:
            return None
        if not isinstance(current, str):
            return None
        value = current.strip()
        return value or None

    def _resolve_repo_path(self, value: Optional[str]) -> Optional[Path]:
        if not value:
            return None
        path = Path(value)
        if not path.is_absolute():
            path = self.repo_root / path
        return path if path.exists() else None

    def _cache_dir(self, packet_dir: Path) -> Path:
        cache_dir = packet_dir / ".cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def _parse_narrative_received_date(self, pair: dict[str, Any]) -> Optional[date]:
        narrative = pair.get("narrative")
        if not isinstance(narrative, dict):
            return None
        raw = narrative.get("received_at")
        if not isinstance(raw, str):
            return None
        text = raw.strip()
        if len(text) < 10:
            return None
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None

    def _extract_estimate(self, inputs: SourcePacketInputs) -> dict[str, Any] | None:
        if inputs.estimate_pdf is None:
            return None

        cache_path = self._cache_dir(inputs.packet_dir) / "estimate.header.json"
        if cache_path.exists():
            return json.loads(cache_path.read_text(encoding="utf-8"))

        raw = self._run_pdf_analysis("estimate", str(inputs.estimate_pdf), "--format", "json")
        parsed = json.loads(raw)
        header = parsed.get("header", {}) if isinstance(parsed, dict) else {}
        if not isinstance(header, dict):
            header = {}

        estimate: dict[str, Any] = {
            "client_company": self._clean(header.get("gc_name")),
            "client_contact": self._clean(header.get("estimator")),
            "client_address": self._clean(header.get("gc_address")),
            "job_name": self._clean(header.get("job_name")),
            "job_location": self._clean(header.get("job_address")),
            "estimate_date": self._mdy_to_iso(self._clean(header.get("date"))),
        }

        cache_path.write_text(json.dumps(estimate, indent=2) + "\n", encoding="utf-8")
        return estimate

    def _extract_noi(self, inputs: SourcePacketInputs) -> dict[str, Any] | None:
        if inputs.noi_pdf is None:
            return None

        cache_dir = self._cache_dir(inputs.packet_dir)
        noi_cache_path = cache_dir / "noi.extracted.json"
        if noi_cache_path.exists():
            return json.loads(noi_cache_path.read_text(encoding="utf-8"))

        text = self._run_pdf_analysis("text", str(inputs.noi_pdf), "--format", "text")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as temp:
            temp.write(text)
            temp_path = Path(temp.name)

        try:
            raw = self._run_pdf_analysis("noi", str(temp_path), "--format", "json")
        finally:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass

        noi = json.loads(raw)
        if not isinstance(noi, dict):
            raise ValueError("NOI extraction did not return a JSON object")

        issued_match = _ISSUED_DATE_RE.search(text)
        if issued_match:
            noi["issuedDate"] = issued_match.group(1)

        expiration_match = _EXPIRATION_DATE_RE.search(text)
        if expiration_match:
            noi["expirationDate"] = expiration_match.group(1)

        noi_cache_path.write_text(json.dumps(noi, indent=2) + "\n", encoding="utf-8")
        return noi

    def _extract_storm_plan(self, inputs: SourcePacketInputs) -> dict[str, Any] | None:
        if inputs.plan_pdf is None:
            return None

        cache_path = self._cache_dir(inputs.packet_dir) / "storm_plan.extracted.json"
        if cache_path.exists():
            return json.loads(cache_path.read_text(encoding="utf-8"))

        text = self._extract_plan_text(inputs.plan_pdf)
        extracted = self._parse_plan_text(text)
        cache_path.write_text(json.dumps(extracted, indent=2) + "\n", encoding="utf-8")
        return extracted

    def _extract_plan_text(self, plan_pdf: Path) -> str:
        # Use OCR-first for scanned plans; fallback to plain text for digital plans.
        try:
            return self._run_pdf_analysis(
                "ocr",
                str(plan_pdf),
                "--provider",
                "auto",
                "--format",
                "text",
            )
        except RuntimeError:
            return self._run_pdf_analysis("text", str(plan_pdf), "--format", "text")

    def _parse_plan_text(self, text: str) -> dict[str, Any]:
        cleaned = text or ""
        project_name = self._extract_project_name(cleaned)
        project_address = self._extract_project_address(cleaned)
        city, state, zip_code = self._extract_city_state_zip(cleaned)

        disturbed_area = self._extract_number(
            cleaned,
            [
                r"\bAcres\s+Disturbed[:\s]+([0-9]+(?:\.[0-9]+)?)",
                r"\bTotal\s+Disturb(?:ed|ance)[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)\s*Acres",
            ],
        )
        total_area = self._extract_number(
            cleaned,
            [
                r"\bTotal\s+Acreage[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)",
                r"\bTotal\s+Project\s+Area[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)\s*Acres",
                r"\bProject\s+Area[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)\s*Acres",
            ],
        )
        county = self._extract_county(cleaned)

        soil_types = self._extract_labeled_value(
            cleaned,
            ["soil type", "soil types", "soils"],
        )
        slopes = self._extract_labeled_value(cleaned, ["slopes", "slope"])
        receiving_waters = self._extract_labeled_value(
            cleaned,
            ["receiving waters", "receiving water"],
        )
        storm_sewer = self._extract_labeled_value(
            cleaned,
            ["storm sewer systems", "storm sewer system", "ms4"],
        )

        return {
            "project_name": project_name,
            "project_address": project_address,
            "city": city,
            "state": state,
            "zip_code": zip_code,
            "county": county,
            "site_area_acres": total_area,
            "total_disturbed_area_acres": disturbed_area,
            "soil_type_description": soil_types,
            "slopes_description": slopes,
            "receiving_water": receiving_waters or storm_sewer,
            "storm_sewer_systems": storm_sewer,
        }

    def _extract_project_name(self, text: str) -> Optional[str]:
        patterns = [
            r"\bProject(?:\s+Name)?\s*[:\-]\s*([^\n]{4,120})",
            r"\bSTORM\s+WATER\s+POLLUTION\s+PREVENTION\s+PLAN(?:S)?(?:\s+FOR)?\s*\n+([^\n]{4,120})",
            r"\bSWPPP(?:\s+PLAN)?(?:\s+FOR)?\s*\n+([^\n]{4,120})",
        ]
        return self._extract_first_match(text, patterns)

    def _extract_project_address(self, text: str) -> Optional[str]:
        # Prefer explicit street/cross-street lines.
        patterns = [
            r"\n([0-9]{1,6}\s+[A-Z0-9 .'\-]{4,120})\n",
            r"\b(?:NWC|NEC|SWC|SEC)\b[^\n]{6,120}",
            r"\b(?:[NS]\s*)?[A-Z0-9 .'\-]{3,80}\s*&\s*(?:[NS]\s*)?[A-Z0-9 .'\-]{3,80}",
        ]
        value = self._extract_first_match(text, patterns)
        if value is None:
            return None
        cleaned = value.strip().strip(",")
        return cleaned if len(cleaned) >= 5 else None

    def _extract_city_state_zip(
        self,
        text: str,
    ) -> tuple[Optional[str], Optional[str], Optional[str]]:
        match = re.search(
            r"\b([A-Za-z][A-Za-z .'\-]{1,40}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b",
            text,
        )
        if match:
            return (
                self._clean(match.group(1)),
                match.group(2).upper(),
                match.group(3),
            )
        match = re.search(r"\b([A-Za-z][A-Za-z .'\-]{1,40}),\s*([A-Z]{2})\b", text)
        if match:
            return (
                self._clean(match.group(1)),
                match.group(2).upper(),
                None,
            )
        return None, None, None

    def _extract_county(self, text: str) -> Optional[str]:
        for county in _AZ_COUNTIES:
            if re.search(rf"\b{re.escape(county)}\s+County\b", text, flags=re.IGNORECASE):
                return f"{county} County"
        return None

    def _extract_number(self, text: str, patterns: list[str]) -> Optional[float]:
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if not match:
                continue
            value = self._clean(match.group(1))
            if not value:
                continue
            try:
                return float(value)
            except ValueError:
                continue
        return None

    def _extract_labeled_value(self, text: str, labels: list[str]) -> Optional[str]:
        for label in labels:
            pattern = re.compile(
                rf"\b{re.escape(label)}\b\s*[:\-]\s*(.+?)(?:{_SECTION_END_RE.pattern}|\n\n|$)",
                flags=re.IGNORECASE | re.DOTALL,
            )
            match = pattern.search(text)
            if not match:
                continue
            value = self._clean(match.group(1))
            if not value:
                continue
            # Keep concise; many OCR blocks are noisy and should not flood payloads.
            return value[:240]
        return None

    def _extract_first_match(self, text: str, patterns: list[str]) -> Optional[str]:
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                value = self._clean(match.group(1) if match.lastindex else match.group(0))
                if value:
                    return value
        return None

    def _run_pdf_analysis(self, *args: str) -> str:
        cmd = [
            "uv",
            "run",
            "--directory",
            "apps/cli-tools/pdf-analysis-cli",
            "pdf-analysis",
            *args,
        ]
        proc = subprocess.run(
            cmd,
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"pdf-analysis failed ({proc.returncode}) for {' '.join(args)}\n"
                f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
            )
        return proc.stdout

    def _mdy_to_iso(self, value: Optional[str]) -> Optional[str]:
        raw = self._clean(value)
        if not raw:
            return None
        match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", raw)
        if not match:
            return raw
        month, day, year = (int(match.group(i)) for i in (1, 2, 3))
        return f"{year:04d}-{month:02d}-{day:02d}"

    def _clean(self, value: Any) -> Optional[str]:
        if value is None:
            return None
        text = " ".join(str(value).split())
        return text or None
