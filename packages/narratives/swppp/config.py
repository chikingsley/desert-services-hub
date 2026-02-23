"""Pydantic Settings for SWPPP document generation."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str | None = None
    template_path: Path = Path("templates/cgp_p3_template.docx")
    output_dir: Path = Path("templates/output")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
