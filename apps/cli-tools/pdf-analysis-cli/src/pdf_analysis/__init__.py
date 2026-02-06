from __future__ import annotations

from typing import Any

__all__ = [
    "AnalysisResult",
    "Estimate",
    "PlanAnalyzer",
    "ProviderManager",
    "extract_estimate",
    "inspect_area",
    "quick_analyze",
]

__version__ = "0.1.0"


def __getattr__(name: str) -> Any:
    if name == "ProviderManager":
        from pdf_analysis.provider_manager import ProviderManager

        return ProviderManager

    if name in {"Estimate", "extract_estimate"}:
        from pdf_analysis.estimates import Estimate, extract_estimate

        return {"Estimate": Estimate, "extract_estimate": extract_estimate}[name]

    if name in {"PlanAnalyzer", "AnalysisResult", "quick_analyze", "inspect_area"}:
        from pdf_analysis.plan_analyzer import (
            AnalysisResult,
            PlanAnalyzer,
            inspect_area,
            quick_analyze,
        )

        mapping = {
            "PlanAnalyzer": PlanAnalyzer,
            "AnalysisResult": AnalysisResult,
            "quick_analyze": quick_analyze,
            "inspect_area": inspect_area,
        }
        return mapping[name]

    raise AttributeError(name)
