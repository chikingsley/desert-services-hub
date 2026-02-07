from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class ProviderName(str, Enum):
    GEMINI = "gemini"
    LOCAL = "local"
    MISTRAL = "mistral"


class ProviderSelector(str, Enum):
    AUTO = "auto"
    GEMINI = "gemini"
    LOCAL = "local"
    MISTRAL = "mistral"


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
    type: Literal["info", "warning", "critical"]
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
