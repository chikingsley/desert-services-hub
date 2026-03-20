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

    local_llm_endpoint: str = "http://100.113.195.95:8800/v1"
    local_llm_model: str = "mlx-community/GLM-OCR-bf16"
    local_llm_chat_model: str = "mlx-community/Qwen3.5-9B-MLX-4bit"
    local_llm_chat_timeout_seconds: float = 60.0
    local_llm_manager_endpoint: str | None = None

    local_llm_public_endpoint: str = "https://llama.peacockery.studio/v1"
    local_llm_public_model: str = "mlx-community/GLM-OCR-bf16"
    local_llm_public_chat_model: str = "mlx-community/Qwen3.5-9B-MLX-4bit"
    local_llm_public_chat_timeout_seconds: float = 60.0
    local_llm_public_manager_endpoint: str | None = None

    # Rust-native OCR via Kreuzberg (PaddleOCR backend)
    kreuzberg_ocr_backend: str = "paddleocr"
    kreuzberg_ocr_language: str = "en"
    kreuzberg_paddle_use_doc_orientation_classify: bool = True
    kreuzberg_paddle_use_textline_orientation: bool = True
    kreuzberg_paddle_use_doc_unwarping: bool = True
    kreuzberg_paddle_det_limit_side_len: int = 1216
    kreuzberg_paddle_det_limit_type: str = "max"
    kreuzberg_paddle_rec_batch_num: int = 8

    pdf_analysis_provider_order: str = "local"
    http_timeout_seconds: float = 7200.0

    @field_validator(
        "openrouter_model",
        "openrouter_base_url",
        "openrouter_timeout_seconds",
        "local_llm_endpoint",
        "local_llm_model",
        "local_llm_chat_model",
        "local_llm_chat_timeout_seconds",
        "local_llm_public_endpoint",
        "local_llm_public_model",
        "local_llm_public_chat_model",
        "local_llm_public_chat_timeout_seconds",
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
                    "local_llm_endpoint": "http://100.113.195.95:8800/v1",
                    "local_llm_model": "mlx-community/GLM-OCR-bf16",
                    "local_llm_chat_model": "mlx-community/Qwen3.5-9B-MLX-4bit",
                    "local_llm_chat_timeout_seconds": "60.0",
                    "local_llm_public_endpoint": "https://llama.peacockery.studio/v1",
                    "local_llm_public_model": "mlx-community/GLM-OCR-bf16",
                    "local_llm_public_chat_model": "mlx-community/Qwen3.5-9B-MLX-4bit",
                    "local_llm_public_chat_timeout_seconds": "60.0",
                    "openrouter_model": "google/gemini-3.1-flash-lite-preview",
                    "openrouter_base_url": "https://openrouter.ai/api/v1/chat/completions",
                    "openrouter_timeout_seconds": "180.0",
                    "kreuzberg_ocr_backend": "paddleocr",
                    "kreuzberg_ocr_language": "en",
                    "kreuzberg_paddle_det_limit_type": "max",
                    "pdf_analysis_provider_order": "local",
                }
                return defaults.get(info.field_name or "", value)
        return value
