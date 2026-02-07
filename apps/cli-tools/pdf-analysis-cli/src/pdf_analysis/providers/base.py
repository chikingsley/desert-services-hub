from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from pdf_analysis.types import (
    ExtractResult,
    IdentifyResult,
    OCRResult,
    PlanAnalysisResult,
    ProviderName,
)


class BaseProvider(ABC):
    name: ProviderName
    cost_per_1k_pages: float = 0.0

    @abstractmethod
    async def is_available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def ocr(self, pdf_path: Path, pages: list[int] | None = None) -> OCRResult:
        raise NotImplementedError

    @abstractmethod
    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
    ) -> ExtractResult:
        raise NotImplementedError

    async def chat(self, prompt: str) -> ExtractResult:
        """Text-only chat completion (no PDF/OCR). Override for provider-specific impl."""
        raise NotImplementedError(f"{self.name.value} does not support chat()")

    @abstractmethod
    async def identify(self, pdf_path: Path) -> IdentifyResult:
        raise NotImplementedError

    @abstractmethod
    async def analyze(self, pdf_path: Path, analysis_type: str) -> PlanAnalysisResult:
        raise NotImplementedError
