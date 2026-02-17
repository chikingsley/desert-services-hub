from __future__ import annotations

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str | None = None

    gemini_model: str = "gemini-3-flash-preview"

    ollama_endpoint: str = "https://ollama.peacockery.studio/v1"
    ollama_model: str = "glm-ocr:latest"
    ollama_chat_model: str = "granite4:latest"
    ollama_manager_endpoint: str | None = None

    pdf_analysis_provider_order: str = "local,gemini"
    http_timeout_seconds: float = 180.0

    @field_validator(
        "ollama_endpoint",
        "ollama_model",
        "ollama_chat_model",
        "pdf_analysis_provider_order",
        mode="before",
    )
    @classmethod
    def _strip_empty_to_default(cls, value: str | None, info: ValidationInfo) -> str | None:
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                defaults: dict[str, str] = {
                    "ollama_endpoint": "https://ollama.peacockery.studio/v1",
                    "ollama_model": "glm-ocr:latest",
                    "ollama_chat_model": "granite4:latest",
                    "pdf_analysis_provider_order": "local,gemini",
                }
                return defaults.get(info.field_name or "", value)
        return value
