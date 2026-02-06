from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str | None = None
    mistral_api_key: str | None = None

    gemini_model: str = "gemini-3-flash-preview"
    mistral_ocr_model: str = "mistral-ocr-latest"
    mistral_chat_model: str = "mistral-large-latest"

    ollama_endpoint: str = "http://localhost:11434/v1"
    ollama_model: str = "glm-ocr:latest"

    pdf_analysis_provider_order: str = "gemini,local,mistral"
    http_timeout_seconds: float = 90.0
