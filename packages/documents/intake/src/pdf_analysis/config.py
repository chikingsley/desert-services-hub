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

    openrouter_api_key: str | None = None
    openrouter_model: str = "google/gemini-3.1-flash-lite-preview"
    openrouter_base_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_timeout_seconds: float = 180.0

    ollama_endpoint: str = "https://ollama.peacockery.studio/v1"
    ollama_model: str = "glm-ocr:latest"
    ollama_chat_model: str = "granite4:latest"
    ollama_chat_timeout_seconds: float = 60.0
    ollama_manager_endpoint: str | None = None

    ollama_public_endpoint: str = "https://llama.peacockery.studio/v1"
    ollama_public_model: str = "glm-ocr:latest"
    ollama_public_chat_model: str = "granite4:latest"
    ollama_public_chat_timeout_seconds: float = 60.0
    ollama_public_manager_endpoint: str | None = None

    # Rust-native OCR via Kreuzberg (PaddleOCR backend)
    kreuzberg_ocr_backend: str = "paddleocr"
    kreuzberg_ocr_language: str = "en"
    kreuzberg_paddle_use_doc_orientation_classify: bool = True
    kreuzberg_paddle_use_textline_orientation: bool = True
    kreuzberg_paddle_use_doc_unwarping: bool = True
    kreuzberg_paddle_det_limit_side_len: int = 1216
    kreuzberg_paddle_det_limit_type: str = "max"
    kreuzberg_paddle_rec_batch_num: int = 8

    pdf_analysis_provider_order: str = "openrouter"
    http_timeout_seconds: float = 7200.0

    @field_validator(
        "openrouter_model",
        "openrouter_base_url",
        "openrouter_timeout_seconds",
        "ollama_endpoint",
        "ollama_model",
        "ollama_chat_model",
        "ollama_chat_timeout_seconds",
        "ollama_public_endpoint",
        "ollama_public_model",
        "ollama_public_chat_model",
        "ollama_public_chat_timeout_seconds",
        "kreuzberg_ocr_backend",
        "kreuzberg_ocr_language",
        "kreuzberg_paddle_det_limit_type",
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
                    "ollama_chat_timeout_seconds": "60.0",
                    "ollama_public_endpoint": "https://llama.peacockery.studio/v1",
                    "ollama_public_model": "glm-ocr:latest",
                    "ollama_public_chat_model": "granite4:latest",
                    "ollama_public_chat_timeout_seconds": "60.0",
                    "openrouter_model": "google/gemini-3.1-flash-lite-preview",
                    "openrouter_base_url": "https://openrouter.ai/api/v1/chat/completions",
                    "openrouter_timeout_seconds": "180.0",
                    "kreuzberg_ocr_backend": "paddleocr",
                    "kreuzberg_ocr_language": "en",
                    "kreuzberg_paddle_det_limit_type": "max",
                    "pdf_analysis_provider_order": "openrouter",
                }
                return defaults.get(info.field_name or "", value)
        return value
