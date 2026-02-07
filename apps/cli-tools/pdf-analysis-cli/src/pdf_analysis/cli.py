from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

import typer

from pdf_analysis.config import Settings
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import (
    ExtractResult,
    IdentifyResult,
    OCRResult,
    OutputFormat,
    PlanAnalysisResult,
    ProviderSelector,
)
from pdf_analysis.utils import parse_page_spec

app = typer.Typer(help="Unified PDF analysis CLI (Gemini, local, Mistral)")


def _manager() -> ProviderManager:
    return ProviderManager(Settings())


def _to_dict(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    return value


def _load_schema(schema: str | None) -> dict[str, object] | None:
    if not schema:
        return None

    schema_path = Path(schema)
    if schema_path.exists():
        return json.loads(schema_path.read_text(encoding="utf-8"))

    return json.loads(schema)


def _render_output(result: Any, output_format: OutputFormat) -> str:
    if output_format == OutputFormat.JSON:
        return json.dumps(_to_dict(result), indent=2)

    if output_format == OutputFormat.MARKDOWN:
        if isinstance(result, OCRResult):
            return (
                "# OCR Result\n\n"
                f"- Provider: `{result.provider.value}`\n"
                f"- Model: `{result.model}`\n"
                f"- Pages: `{result.pages}`\n\n"
                f"{result.text}\n"
            )

        return "```json\n" + json.dumps(_to_dict(result), indent=2) + "\n```"

    # text
    if isinstance(result, OCRResult):
        return result.text

    if isinstance(result, ExtractResult):
        return json.dumps(result.data, indent=2)

    if isinstance(result, IdentifyResult):
        return (
            f"Document type: {result.document_type}\n"
            f"Document name: {result.document_name}\n"
            f"Confidence: {result.confidence:.2f}\n"
            f"Indicators: {', '.join(result.indicators) if result.indicators else '(none)'}\n"
            f"Provider: {result.provider.value} ({result.model})"
        )

    if isinstance(result, PlanAnalysisResult):
        findings_text = "\n".join(
            f"- [{f.type}] {f.message}" + (f" ({f.location})" if f.location else "")
            for f in result.findings
        )
        return (
            f"Plan type: {result.plan_type}\n"
            f"Provider: {result.provider.value} ({result.model})\n"
            f"Confidence: {result.confidence:.2f}\n\n"
            f"Measurements:\n{json.dumps(result.measurements, indent=2)}\n\n"
            f"Counts:\n{json.dumps(result.counts, indent=2)}\n\n"
            f"Compliance:\n{json.dumps(result.compliance, indent=2)}\n\n"
            f"Findings:\n{findings_text if findings_text else '(none)'}"
        )

    return str(result)


def _write_or_echo(output: str, output_path: Path | None) -> None:
    if output_path:
        output_path.write_text(output, encoding="utf-8")
        typer.echo(f"Wrote output: {output_path}")
    else:
        typer.echo(output)


@app.command()
def status() -> None:
    """Show provider availability and configured priority order."""
    manager = _manager()
    statuses = asyncio.run(manager.check_availability())

    for status_item in statuses:
        state = "available" if status_item.available else "unavailable"
        error_suffix = f" ({status_item.error})" if status_item.error else ""
        typer.echo(
            f"[{status_item.priority}] {status_item.name.value:<7} "
            f"{state:<11} cost=${status_item.cost_per_1k_pages}/1K{error_suffix}"
        )


@app.command()
def ocr(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    provider: ProviderSelector = typer.Option(ProviderSelector.AUTO, "--provider", "-p"),
    pages: str | None = typer.Option(None, "--pages", help="Page spec, e.g. 1,3,5-9"),
    output_format: OutputFormat = typer.Option(OutputFormat.TEXT, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Run OCR and output text/json/markdown."""
    parsed_pages = parse_page_spec(pages)
    manager = _manager()
    result = asyncio.run(manager.ocr(pdf_path, pages=parsed_pages, provider=provider))
    rendered = _render_output(result, output_format)
    _write_or_echo(rendered, output)


@app.command()
def extract(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    prompt: str = typer.Argument(...),
    provider: ProviderSelector = typer.Option(ProviderSelector.AUTO, "--provider", "-p"),
    schema: str | None = typer.Option(
        None,
        "--schema",
        help="Inline JSON schema or path to a JSON schema file",
    ),
    output_format: OutputFormat = typer.Option(OutputFormat.JSON, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Extract structured data from a document."""
    loaded_schema = _load_schema(schema)
    manager = _manager()
    result = asyncio.run(
        manager.extract(
            pdf_path,
            prompt=prompt,
            schema=loaded_schema,
            provider=provider,
        )
    )
    rendered = _render_output(result, output_format)
    _write_or_echo(rendered, output)


@app.command()
def identify(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    provider: ProviderSelector = typer.Option(ProviderSelector.AUTO, "--provider", "-p"),
    rename: bool = typer.Option(False, "--rename", help="Rename file to suggested filename"),
    output_format: OutputFormat = typer.Option(OutputFormat.TEXT, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Identify document type and metadata."""
    manager = _manager()
    result = asyncio.run(manager.identify(pdf_path, provider=provider))

    if rename and result.suggested_filename:
        target = pdf_path.with_name(result.suggested_filename)
        if target.exists() and target != pdf_path:
            stem = target.stem
            suffix = target.suffix
            counter = 1
            while target.exists():
                target = pdf_path.with_name(f"{stem}_{counter}{suffix}")
                counter += 1
        pdf_path.rename(target)
        result.suggested_filename = target.name
        typer.echo(f"Renamed: {pdf_path.name} -> {target.name}")

    rendered = _render_output(result, output_format)
    _write_or_echo(rendered, output)


@app.command()
def analyze(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    analysis_type: str = typer.Option(..., "--analysis-type", "--type"),
    provider: ProviderSelector = typer.Option(ProviderSelector.AUTO, "--provider", "-p"),
    output_format: OutputFormat = typer.Option(OutputFormat.JSON, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Run structured plan analysis."""
    manager = _manager()
    result = asyncio.run(manager.analyze(pdf_path, analysis_type=analysis_type, provider=provider))
    rendered = _render_output(result, output_format)
    _write_or_echo(rendered, output)


@app.command("gemini-ocr")
def gemini_ocr(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    max_pages: int = typer.Option(0, "--max-pages", "-p"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Backward-compatible Gemini OCR command used by older automations."""
    pages = list(range(1, max_pages + 1)) if max_pages > 0 else None
    manager = _manager()
    result = asyncio.run(manager.ocr(pdf_path, pages=pages, provider=ProviderSelector.GEMINI))

    output_path = output if output else pdf_path.with_suffix(".gemini.md")
    output_path.write_text(result.text, encoding="utf-8")
    typer.echo(f"Wrote output: {output_path}")


@app.command()
def estimate(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    output_format: OutputFormat = typer.Option(OutputFormat.JSON, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Extract structured schedule of values from a Desert Services estimate PDF."""
    from pdf_analysis.estimates import extract_estimate

    result = extract_estimate(pdf_path)
    rendered = json.dumps(result.model_dump(), indent=2)

    if output_format == OutputFormat.TEXT:
        lines = [f"Estimate #{result.header.estimate_number}"]
        if result.header.revision:
            lines[0] += f" ({result.header.revision})"
        lines.append(f"Date: {result.header.date}")
        lines.append(f"GC: {result.header.gc_name}")
        lines.append(f"Job: {result.header.job_name}")
        if result.header.job_address:
            lines.append(f"Address: {result.header.job_address}")
        lines.append(f"Estimator: {result.header.estimator}")
        lines.append("")
        lines.append("Line Items:")
        for item in result.line_items:
            tax_marker = " (T)" if item.taxable else ""
            lines.append(
                f"  {item.item}: {item.description} — {item.qty} x ${item.unit_cost:.2f} = ${item.total:.2f}{tax_marker}"
            )
        if result.additional_services:
            lines.append("")
            lines.append("Additional Services:")
            for svc in result.additional_services:
                lines.append(f"  {svc.item}: {svc.description}")
        lines.append("")
        lines.append(f"Grand Total: ${result.grand_total:,.2f}")
        rendered = "\n".join(lines)

    _write_or_echo(rendered, output)


@app.command()
def classify(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True),
    output_format: OutputFormat = typer.Option(OutputFormat.TEXT, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Classify a PDF (or directory of PDFs) by document type using heuristics.

    No LLM calls — uses pdfplumber text extraction and keyword rules.
    Supports: contract, estimate, loi, po, work_order, noi, swppp_plan,
    dust_permit, insurance, tax_form, lien_waiver, prelien, checklist.
    """
    from pdf_analysis.classify import ClassifyResult, classify_dir, classify_pdf

    results: list[ClassifyResult]
    if pdf_path.is_dir():
        results = classify_dir(pdf_path)
    else:
        results = [classify_pdf(pdf_path)]

    if output_format == OutputFormat.JSON:
        import dataclasses

        rendered = json.dumps([dataclasses.asdict(r) for r in results], indent=2)
    elif output_format == OutputFormat.MARKDOWN:
        lines = ["| File | Type | Confidence | Indicators |", "| --- | --- | --- | --- |"]
        for r in results:
            indicators = ", ".join(r.indicators)
            lines.append(f"| {r.filename} | {r.document_type} | {r.confidence:.0%} | {indicators} |")
        rendered = "\n".join(lines)
    else:
        lines = []
        for r in results:
            indicators = ", ".join(r.indicators)
            lines.append(f"{r.document_type:<15} {r.confidence:.0%}  {r.filename}")
            if r.indicators:
                lines.append(f"{'':15}      {indicators}")
        rendered = "\n".join(lines)

    _write_or_echo(rendered, output)


@app.command()
def text(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    max_pages: int = typer.Option(0, "--max-pages", "-p", help="Max pages (0=all)"),
    output_format: OutputFormat = typer.Option(OutputFormat.TEXT, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Extract text from a PDF using pdfplumber (no LLM, no API calls).

    Fast local text extraction. Use this to see what's in a PDF before
    running LLM analysis. Returns empty for scanned/image-only PDFs.
    """
    from pdf_analysis.ingest import extract_text

    result = extract_text(pdf_path, max_pages=max_pages)

    if output_format == OutputFormat.JSON:
        import dataclasses

        rendered = json.dumps(dataclasses.asdict(result), indent=2)
    elif output_format == OutputFormat.MARKDOWN:
        rendered = (
            f"# {result.filename}\n\n"
            f"- Pages: {result.page_count}\n"
            f"- Pages with text: {result.pages_with_text}\n\n"
            f"{result.text}\n"
        )
    else:
        if not result.has_text:
            rendered = f"[no extractable text — {result.page_count} pages, needs OCR]"
        else:
            rendered = result.text

    _write_or_echo(rendered, output)


@app.command()
def ingest(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True),
    provider: ProviderSelector = typer.Option(ProviderSelector.AUTO, "--provider", "-p"),
    output_format: OutputFormat = typer.Option(OutputFormat.JSON, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Analyze a PDF (or directory) with LLM: classify + extract in one pass.

    Uses pdfplumber for text, falls back to OCR for scanned docs.
    Model determines document type and extracts all relevant fields.
    No hardcoded categories — the model figures it out.
    """
    from pdf_analysis.ingest import IngestResult, ingest_dir, ingest_pdf

    results: list[IngestResult]
    if pdf_path.is_dir():
        results = asyncio.run(ingest_dir(pdf_path, provider=provider))
    else:
        results = [asyncio.run(ingest_pdf(pdf_path, provider=provider))]

    if output_format == OutputFormat.JSON:
        import dataclasses

        data = [dataclasses.asdict(r) for r in results]
        # Don't dump raw_text in JSON output — too large
        for d in data:
            d.pop("raw_text", None)
        rendered = json.dumps(data, indent=2)
    elif output_format == OutputFormat.TEXT:
        lines = []
        for r in results:
            lines.append(f"{r.document_type:<20} {r.filename}")
            lines.append(f"{'':20} {r.summary}")
            extracted = r.extracted
            if extracted.get("financial", {}).get("contract_value"):
                lines.append(f"{'':20} Value: ${extracted['financial']['contract_value']:,.2f}")
            if extracted.get("estimate_reference"):
                lines.append(f"{'':20} Estimate: {extracted['estimate_reference']}")
            lines.append(f"{'':20} [{r.text_method}, {r.model}, {r.processing_time_ms}ms]")
            lines.append("")
        rendered = "\n".join(lines)
    else:
        rendered = json.dumps(
            [{"filename": r.filename, "type": r.document_type, "summary": r.summary} for r in results],
            indent=2,
        )

    _write_or_echo(rendered, output)


@app.command()
def noi(
    pdf_path: Path = typer.Argument(..., exists=True, readable=True, dir_okay=False),
    output_format: OutputFormat = typer.Option(OutputFormat.JSON, "--format", "-f"),
    output: Path | None = typer.Option(None, "--output", "-o"),
) -> None:
    """Extract structured data from an ADEQ NOI certificate PDF."""
    from pdf_analysis.noi import extract_noi

    result = extract_noi(pdf_path)
    rendered = json.dumps(result.model_dump(by_alias=True), indent=2)

    if output_format == OutputFormat.TEXT:
        lines = [f"NOI: {result.permit_id or 'Unknown'}"]
        lines.append(f"LTF#: {result.ltf_number or 'Unknown'}")
        lines.append(f"Applicant: {result.applicant_name}")
        if result.applicant_address1:
            addr = result.applicant_address1
            if result.applicant_address2:
                addr += f", {result.applicant_address2}"
            lines.append(f"Address: {addr}")
        if result.applicant_city:
            lines.append(
                f"         {result.applicant_city}, "
                f"{result.applicant_state or ''} {result.applicant_zip or ''}"
            )
        lines.append("")
        lines.append(f"Site: {result.site_name}")
        if result.site_address:
            lines.append(f"Site Address: {result.site_address}")
        if result.latitude is not None:
            lines.append(f"Coordinates: {result.latitude}, {result.longitude}")
        if result.acres_disturbed is not None:
            lines.append(f"Acres Disturbed: {result.acres_disturbed}")
        lines.append("")
        lines.append("SWPPP Contact:")
        lines.append(
            f"  {result.swppp_contact_first_name or ''} "
            f"{result.swppp_contact_last_name or ''}"
        )
        if result.swppp_contact_email:
            lines.append(f"  {result.swppp_contact_email}")
        if result.swppp_contact_phone:
            lines.append(f"  {result.swppp_contact_phone}")
        rendered = "\n".join(lines)

    _write_or_echo(rendered, output)


def main() -> None:
    app()


if __name__ == "__main__":
    main()
