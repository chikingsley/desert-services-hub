"""Unit tests for output formatting."""

from __future__ import annotations

from cf_mcp.output import print_json, print_table


def test_print_table(capsys):
    print_table(["Name", "Value"], [["foo", "bar"], ["baz", "qux"]])
    out = capsys.readouterr().out
    assert "Name" in out
    assert "foo" in out
    assert "baz" in out


def test_print_table_empty(capsys):
    print_table(["Name"], [])
    out = capsys.readouterr().out
    assert "(no results)" in out


def test_print_json(capsys):
    print_json({"key": "value", "num": 42})
    out = capsys.readouterr().out
    assert '"key": "value"' in out
    assert '"num": 42' in out


def test_print_json_list(capsys):
    print_json([{"a": 1}, {"b": 2}])
    out = capsys.readouterr().out
    assert '"a": 1' in out
    assert '"b": 2' in out
