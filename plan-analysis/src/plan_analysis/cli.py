"""CLI for Plan Analysis OCR."""

from pathlib import Path
from typing import Annotated

import typer
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from plan_analysis.plan_analyzer import PlanAnalyzer


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = Field(
        alias="GEMINI_API_KEY",
        description="Google Gemini API key",
    )


app = typer.Typer(help="Plan Analysis OCR CLI")


@app.command()
def gemini_ocr(
    pdf_path: Annotated[
        Path,
        typer.Argument(
            help="Path to PDF file to OCR",
            exists=True,
            file_okay=True,
            dir_okay=False,
            readable=True,
        ),
    ],
    output: Annotated[
        Path | None,
        typer.Option(
            "--output",
            "-o",
            help="Output markdown file path (default: same dir with .md extension)",
        ),
    ] = None,
    max_pages: Annotated[
        int,
        typer.Option(
            "--max-pages",
            "-p",
            help="Maximum pages to process (0 = all)",
        ),
    ] = 0,
) -> None:
    """Run Gemini 3 Flash OCR on a PDF."""
    settings = Settings()

    if output is None:
        output = pdf_path.with_suffix(".gemini.md")

    typer.echo(f"Running Gemini OCR on: {pdf_path.name}")
    typer.echo(f"Output: {output}")

    analyzer = PlanAnalyzer(api_key=settings.gemini_api_key)

    # For just OCR (no analysis), we use detailed_inspection with a simple prompt
    prompt = "Extract all text from this PDF. Preserve document structure, headers, footers, and any tables. Output in markdown format with page separators."

    if max_pages > 0:
        prompt += f" Only process the first {max_pages} pages."

    result = analyzer.detailed_inspection(
        image_path=str(pdf_path),
        inspection_prompt=prompt,
    )

    # Write output
    output.write_text(result["raw_analysis"], encoding="utf-8")

    typer.echo(f"✓ Complete: {len(result['raw_analysis'])} characters written")


def main() -> None:
    """Entry point for CLI."""
    app()
