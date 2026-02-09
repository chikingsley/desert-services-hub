from __future__ import annotations

from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import TypeVar

from pdf_analysis.config import Settings
from pdf_analysis.types import (
    ExtractResult,
    IdentifyResult,
    OCRResult,
    PlanAnalysisResult,
    ProviderName,
    ProviderSelector,
    ProviderStatus,
)

from .providers.base import BaseProvider
from .providers.gemini import GeminiProvider
from .providers.local import LocalProvider
from .providers.mistral import MistralProvider

ProviderResult = OCRResult | ExtractResult | IdentifyResult | PlanAnalysisResult
TResult = TypeVar("TResult", bound=ProviderResult)


class ProviderManager:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or Settings()
        self.providers: dict[ProviderName, BaseProvider] = {
            ProviderName.GEMINI: GeminiProvider(self.settings),
            ProviderName.LOCAL: LocalProvider(self.settings),
            ProviderName.MISTRAL: MistralProvider(self.settings),
        }
        self.order = self._resolve_order(self.settings.pdf_analysis_provider_order)

    async def check_availability(self) -> list[ProviderStatus]:
        statuses: list[ProviderStatus] = []
        for idx, provider_name in enumerate(self.order):
            provider = self.providers[provider_name]
            try:
                available = await provider.is_available()
                statuses.append(
                    ProviderStatus(
                        name=provider_name,
                        available=available,
                        priority=idx,
                        cost_per_1k_pages=provider.cost_per_1k_pages,
                    )
                )
            except Exception as err:  # pragma: no cover - defensive
                statuses.append(
                    ProviderStatus(
                        name=provider_name,
                        available=False,
                        priority=idx,
                        cost_per_1k_pages=provider.cost_per_1k_pages,
                        error=str(err),
                    )
                )
        return statuses

    async def ocr(
        self,
        pdf_path: Path,
        pages: list[int] | None = None,
        provider: ProviderSelector = ProviderSelector.AUTO,
    ) -> OCRResult:
        return await self._run_with_fallback(
            provider=provider,
            operation="ocr",
            fn=lambda p: p.ocr(pdf_path, pages=pages),
        )

    async def chat(
        self,
        prompt: str,
        provider: ProviderSelector = ProviderSelector.AUTO,
    ) -> ExtractResult:
        """Text-only chat completion — no PDF, no OCR. For when you already have the text."""
        return await self._run_with_fallback(
            provider=provider,
            operation="chat",
            fn=lambda p: p.chat(prompt),
        )

    async def extract(
        self,
        pdf_path: Path,
        prompt: str,
        schema: dict[str, object] | None = None,
        provider: ProviderSelector = ProviderSelector.AUTO,
    ) -> ExtractResult:
        return await self._run_with_fallback(
            provider=provider,
            operation="extract",
            fn=lambda p: p.extract(pdf_path, prompt=prompt, schema=schema),
        )

    async def identify(
        self,
        pdf_path: Path,
        provider: ProviderSelector = ProviderSelector.AUTO,
    ) -> IdentifyResult:
        return await self._run_with_fallback(
            provider=provider,
            operation="identify",
            fn=lambda p: p.identify(pdf_path),
        )

    async def analyze(
        self,
        pdf_path: Path,
        analysis_type: str,
        provider: ProviderSelector = ProviderSelector.AUTO,
    ) -> PlanAnalysisResult:
        return await self._run_with_fallback(
            provider=provider,
            operation="analyze",
            fn=lambda p: p.analyze(pdf_path, analysis_type),
        )

    async def _run_with_fallback(
        self,
        provider: ProviderSelector,
        operation: str,
        fn: Callable[[BaseProvider], Awaitable[TResult]],
    ) -> TResult:
        provider_order = self._pick_order(provider)
        errors: list[str] = []

        for idx, name in enumerate(provider_order):
            instance = self.providers[name]
            if not await instance.is_available():
                errors.append(f"{name.value}: unavailable")
                continue

            try:
                result = await fn(instance)
                fallback_used = idx > 0
                return self._attach_fallback_metadata(
                    result=result,
                    fallback_used=fallback_used,
                    attempted_order=[p.value for p in provider_order],
                )
            except Exception as err:
                errors.append(f"{name.value}: {err}")

        raise RuntimeError(
            f"All providers failed for '{operation}'. "
            f"Tried: {', '.join(p.value for p in provider_order)}. "
            f"Errors: {' | '.join(errors)}"
        )

    @staticmethod
    def _attach_fallback_metadata(
        result: TResult,
        fallback_used: bool,
        attempted_order: list[str],
    ) -> TResult:
        metadata_payload = {
            "fallback_used": fallback_used,
            "attempted_order": attempted_order,
        }

        result.metadata = {**result.metadata, **metadata_payload}
        return result

    def _pick_order(self, provider: ProviderSelector) -> list[ProviderName]:
        if provider == ProviderSelector.AUTO:
            return self.order
        selected = ProviderName(provider.value)
        return [selected]

    @staticmethod
    def _resolve_order(value: str) -> list[ProviderName]:
        parsed: list[ProviderName] = []
        for token in value.split(","):
            slug = token.strip().lower()
            if not slug:
                continue
            try:
                provider = ProviderName(slug)
            except ValueError:
                continue
            if provider not in parsed:
                parsed.append(provider)

        if not parsed:
            parsed = [ProviderName.GEMINI, ProviderName.LOCAL, ProviderName.MISTRAL]

        for provider in [ProviderName.GEMINI, ProviderName.LOCAL, ProviderName.MISTRAL]:
            if provider not in parsed:
                parsed.append(provider)

        return parsed
