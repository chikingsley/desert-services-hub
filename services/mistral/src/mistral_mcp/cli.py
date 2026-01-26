#!/usr/bin/env python3
"""
CLI for Mistral Document AI.

Usage:
    mistral-mcp serve                    # Run as MCP server
    mistral-mcp ocr <file> [output]      # OCR a document (durable)
    mistral-mcp extract <file> <prompt>  # Extract with JSON schema
    mistral-mcp identify <file>          # Identify document (GC, project, type)

Examples:
    # Run MCP server
    mistral-mcp serve

    # OCR a PDF (creates contract.md next to contract.pdf)
    mistral-mcp ocr /path/to/contract.pdf

    # OCR with custom output path
    mistral-mcp ocr /path/to/contract.pdf /output/contract.md

    # Extract document info (first 5 pages)
    mistral-mcp extract /path/to/contract.pdf "What type of document is this?"

    # Identify a document (auto-renames by default)
    mistral-mcp identify /path/to/contract.pdf

    # Identify without renaming
    mistral-mcp identify /path/to/contract.pdf --no-rename
"""

import argparse
import asyncio
import json
import re
import tempfile
from pathlib import Path

from mistral_mcp.client import MistralClient
from mistral_mcp.pdf_utils import extract_pages, get_pdf_info
from mistral_mcp.split_ocr import split_and_ocr


def cmd_serve(_args: argparse.Namespace) -> None:
    """Run as MCP server."""
    from mistral_mcp.server import main as server_main  # noqa: PLC0415

    server_main()


async def cmd_ocr_async(args: argparse.Namespace) -> None:
    """OCR a document (durable)."""
    source = Path(args.file)
    output = Path(args.output) if args.output else source.with_suffix(".md")

    result = await split_and_ocr(
        str(source),
        str(output),
        max_concurrent=args.concurrent,
    )

    if result.resumed_from > 0:
        print(f"Resumed from page {result.resumed_from}")

    print(f"Processed {result.pages_processed}/{result.total_pages} pages")
    print(f"Output: {result.output_file}")


def cmd_ocr(args: argparse.Namespace) -> None:
    """OCR a document (sync wrapper)."""
    asyncio.run(cmd_ocr_async(args))


async def cmd_extract_async(args: argparse.Namespace) -> None:
    """Extract from first N pages with a prompt."""
    source = Path(args.file)
    client = MistralClient()

    # Get page count and clamp
    info = get_pdf_info(str(source))
    actual_pages = min(args.pages, info.page_count)

    # Slice first N pages
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extract_pages(str(source), 1, actual_pages, tmp_path)

        # Use free-form JSON extraction (no schema in CLI for simplicity)
        result = await client.extract_json(
            args.prompt,
            document_path=tmp_path,
        )

        print(result)

    finally:
        Path(tmp_path).unlink(missing_ok=True)


def cmd_extract(args: argparse.Namespace) -> None:
    """Extract (sync wrapper)."""
    asyncio.run(cmd_extract_async(args))


# Import schema/prompt from server
IDENTIFY_SCHEMA: dict[str, object] = {
    "type": "object",
    "properties": {
        "gc_company": {
            "type": "string",
            "description": "General contractor company name",
        },
        "project_name": {
            "type": "string",
            "description": "Project name",
        },
        "document_type": {
            "type": "string",
            "enum": [
                "contract",
                "estimate",
                "LOI",
                "change_order",
                "permit",
                "insurance_cert",
                "invoice",
                "correspondence",
                "other",
            ],
            "description": "Type of document",
        },
        "action_required": {
            "type": ["string", "null"],
            "description": "Action required, or null if none",
        },
        "deadline": {
            "type": ["string", "null"],
            "description": "Deadline in YYYY-MM-DD format, or null",
        },
        "document_number": {
            "type": ["string", "null"],
            "description": "Document ID/number, or null",
        },
    },
    "required": ["gc_company", "project_name", "document_type"],
}

IDENTIFY_PROMPT = """Identify this construction document.

Extract:
- gc_company: The legal company name (from letterhead/signature block, not logos)
- project_name: The project name (use common/short name, not full legal)
- document_type: contract, estimate, LOI, change_order, permit,
  insurance_cert, invoice, correspondence, or other.
  Use "correspondence" for letters, notices, RFIs, or any document that
  isn't itself a contract/estimate/permit/etc.
- action_required: If recipient must act, describe briefly. Else null.
- deadline: Deadline in YYYY-MM-DD format, or null if none.
- document_number: Any ID/number on the doc (22-014, C-0001, EST-1234, etc).

Be concise."""


def sanitize_filename(name: str) -> str:
    """Sanitize a string for use in filenames."""
    name = re.sub(r"[\s_]+", "-", name)
    name = re.sub(r"[^\w\-]", "", name)
    name = re.sub(r"-+", "-", name)
    return name.strip("-")


async def cmd_identify_async(args: argparse.Namespace) -> None:
    """Identify a document."""
    source = Path(args.file)
    client = MistralClient()

    # Get page count and clamp
    info = get_pdf_info(str(source))
    actual_pages = min(args.pages, info.page_count)

    # Slice first N pages
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        extract_pages(str(source), 1, actual_pages, tmp_path)

        result_json = await client.extract_structured(
            IDENTIFY_PROMPT,
            IDENTIFY_SCHEMA,
            schema_name="document_identification",
            document_path=tmp_path,
        )

        result = json.loads(result_json)

        # Rename unless disabled
        if not args.no_rename:
            doc_type = sanitize_filename(result.get("document_type", "unknown"))
            project = sanitize_filename(result.get("project_name", "unknown"))
            gc = sanitize_filename(result.get("gc_company", "unknown"))
            doc_num = result.get("document_number")

            if doc_num:
                doc_num_clean = sanitize_filename(doc_num)
                new_name = f"{doc_type}_{project}_{gc}_{doc_num_clean}{source.suffix}"
            else:
                new_name = f"{doc_type}_{project}_{gc}{source.suffix}"

            new_path = source.parent / new_name

            # Handle collision
            counter = 1
            while new_path.exists() and new_path != source:
                if doc_num:
                    base = f"{doc_type}_{project}_{gc}_{doc_num_clean}"
                else:
                    base = f"{doc_type}_{project}_{gc}"
                new_name = f"{base}_{counter}{source.suffix}"
                new_path = source.parent / new_name
                counter += 1

            source.rename(new_path)
            result["new_path"] = str(new_path)
            print(f"Renamed: {source.name} -> {new_name}")

        print(json.dumps(result, indent=2))

    finally:
        Path(tmp_path).unlink(missing_ok=True)


def cmd_identify(args: argparse.Namespace) -> None:
    """Identify (sync wrapper)."""
    asyncio.run(cmd_identify_async(args))


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Mistral Document AI CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # serve command
    serve_parser = subparsers.add_parser("serve", help="Run as MCP server")
    serve_parser.set_defaults(func=cmd_serve)

    # ocr command
    ocr_parser = subparsers.add_parser(
        "ocr",
        help="OCR a document (durable, resumable)",
    )
    ocr_parser.add_argument("file", help="Path to PDF file")
    ocr_parser.add_argument(
        "output",
        nargs="?",
        help="Output markdown file (default: same dir, .md extension)",
    )
    ocr_parser.add_argument(
        "--concurrent",
        type=int,
        default=5,
        help="Max concurrent OCR requests (default: 5)",
    )
    ocr_parser.set_defaults(func=cmd_ocr)

    # extract command
    extract_parser = subparsers.add_parser(
        "extract",
        help="Extract info from first N pages",
    )
    extract_parser.add_argument("file", help="Path to PDF file")
    extract_parser.add_argument("prompt", help="What to extract")
    extract_parser.add_argument(
        "--pages",
        type=int,
        default=5,
        help="Number of pages to analyze (default: 5)",
    )
    extract_parser.set_defaults(func=cmd_extract)

    # identify command
    identify_parser = subparsers.add_parser(
        "identify",
        help="Identify document (GC, project, type)",
    )
    identify_parser.add_argument("file", help="Path to PDF file")
    identify_parser.add_argument(
        "--no-rename",
        action="store_true",
        help="Don't rename file (default: renames to {type}_{project}_{gc}_{number}.pdf)",
    )
    identify_parser.add_argument(
        "--pages",
        type=int,
        default=3,
        help="Number of pages to analyze (default: 3)",
    )
    identify_parser.set_defaults(func=cmd_identify)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
