from pathlib import Path

import pytest
import typer

from pdf_analysis.cli import _resolve_output_path
from pdf_analysis.types import OutputFormat


def test_resolve_output_path_multi_result_creates_directory(tmp_path: Path) -> None:
    output_dir = tmp_path / "parsed"
    target = _resolve_output_path(
        output=output_dir,
        result_filename="example.pdf",
        output_format=OutputFormat.MARKDOWN,
        multiple_results=True,
    )

    assert target == output_dir / "example.md"
    assert output_dir.is_dir()


def test_resolve_output_path_multi_result_rejects_file_path(tmp_path: Path) -> None:
    with pytest.raises(typer.BadParameter):
        _resolve_output_path(
            output=tmp_path / "out.md",
            result_filename="example.pdf",
            output_format=OutputFormat.MARKDOWN,
            multiple_results=True,
        )


def test_resolve_output_path_single_result_to_directory(tmp_path: Path) -> None:
    output_dir = tmp_path / "parsed"
    output_dir.mkdir()

    target = _resolve_output_path(
        output=output_dir,
        result_filename="example.pdf",
        output_format=OutputFormat.JSON,
        multiple_results=False,
    )

    assert target == output_dir / "example.json"
