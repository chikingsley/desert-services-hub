from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal, TypeGuard


class ProviderName(str, Enum):
    GEMINI = "gemini"
    LOCAL = "local"


class ProviderSelector(str, Enum):
    AUTO = "auto"
    GEMINI = "gemini"
    LOCAL = "local"


class OutputFormat(str, Enum):
    TEXT = "text"
    JSON = "json"
    MARKDOWN = "markdown"


DocumentType = Literal[
    "contract",
    "estimate",
    "loi",
    "po",
    "work_order",
    "noi",
    "swppp_plan",
    "dust_permit",
    "civil_plan",
    "grading_plan",
    "drainage_plan",
    "insurance",
    "tax_form",
    "lien_waiver",
    "prelien",
    "checklist",
    "unknown",
]

PlanFindingType = Literal["info", "warning", "critical"]

_DOCUMENT_TYPES: set[str] = {
    "contract",
    "estimate",
    "loi",
    "po",
    "work_order",
    "noi",
    "swppp_plan",
    "dust_permit",
    "civil_plan",
    "grading_plan",
    "drainage_plan",
    "insurance",
    "tax_form",
    "lien_waiver",
    "prelien",
    "checklist",
    "unknown",
}

_PLAN_FINDING_TYPES: set[str] = {"info", "warning", "critical"}


def is_document_type(value: str) -> TypeGuard[DocumentType]:
    return value in _DOCUMENT_TYPES


def is_plan_finding_type(value: str) -> TypeGuard[PlanFindingType]:
    return value in _PLAN_FINDING_TYPES


@dataclass(slots=True)
class ProviderStatus:
    name: ProviderName
    available: bool
    priority: int
    cost_per_1k_pages: float
    error: str | None = None


@dataclass(slots=True)
class OCRResult:
    provider: ProviderName
    text: str
    pages: list[int]
    processing_time_ms: int
    model: str
    confidence: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ExtractResult:
    provider: ProviderName
    data: dict[str, Any]
    processing_time_ms: int
    model: str
    confidence: float = 0.0
    raw_text: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class IdentifyResult:
    provider: ProviderName
    document_type: DocumentType
    document_name: str
    confidence: float
    indicators: list[str]
    processing_time_ms: int
    model: str
    suggested_filename: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PlanFinding:
    type: PlanFindingType
    message: str
    location: str | None = None


@dataclass(slots=True)
class PlanAnalysisResult:
    provider: ProviderName
    plan_type: str
    measurements: dict[str, float]
    counts: dict[str, int]
    compliance: dict[str, list[str]]
    findings: list[PlanFinding]
    processing_time_ms: int
    model: str
    confidence: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
