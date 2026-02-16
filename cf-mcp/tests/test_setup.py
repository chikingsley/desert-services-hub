"""Tests for the setup wizard — unit tests + real end-to-end integration tests."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from cf_mcp.setup import (
    _check_permissions,
    _gather_info,
    _is_temporary_path,
    _write_codex_config,
    _write_json_config,
    run_setup,
)

# ── Helpers ──


def _make_mcp_config(
    command: str = "/usr/local/bin/cf",
    tunnel_id: str = "",
) -> dict[str, Any]:
    env: dict[str, str] = {"CF_API_TOKEN": "test-token-123"}
    if tunnel_id:
        env["CLOUDFLARE_TUNNEL_ID"] = tunnel_id
    return {"command": command, "args": ["mcp"], "env": env}


# ── Unit: permission checking ──


def test_check_permissions_all_present():
    perm_names = [
        "Zone Read",
        "DNS Write",
        "Cloudflare Tunnel Edit",
        "Workers Scripts Read",
        "API Tokens Read",
    ]
    results = _check_permissions(perm_names)
    assert all(found for _, _, found in results)


def test_check_permissions_partial():
    perm_names = ["Zone Read", "DNS Write"]
    results = _check_permissions(perm_names)
    found_map = {name: found for name, _, found in results}
    assert found_map["Zone Read"] is True
    assert found_map["DNS"] is True
    assert found_map["Cloudflare Tunnel"] is False


def test_check_permissions_case_insensitive():
    results = _check_permissions(["zone read"])
    assert results[0][2] is True


# ── Unit: temp path detection ──


def test_is_temporary_path():
    import tempfile

    assert _is_temporary_path(f"{tempfile.gettempdir()}/bin/cf")
    assert _is_temporary_path("/home/user/.cache/uv/archive/abc/bin/cf")
    assert not _is_temporary_path("/home/user/.local/bin/cf")


# ── Unit: JSON config writing ──


def test_write_json_config_creates_new_file(tmp_path: Path):
    path = tmp_path / "config.json"
    config = {**_make_mcp_config(), "type": "stdio"}

    assert _write_json_config(path, config)

    data = json.loads(path.read_text())
    server = data["mcpServers"]["cf-mcp"]
    assert server["command"] == "/usr/local/bin/cf"
    assert server["args"] == ["mcp"]
    assert server["env"]["CF_API_TOKEN"] == "test-token-123"
    assert server["type"] == "stdio"


def test_write_json_config_merges_into_existing(tmp_path: Path):
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps(
            {
                "preferences": {"theme": "dark"},
                "mcpServers": {"other": {"command": "x"}},
            }
        )
    )

    assert _write_json_config(path, _make_mcp_config())

    data = json.loads(path.read_text())
    assert data["preferences"]["theme"] == "dark"
    assert "other" in data["mcpServers"]
    assert "cf-mcp" in data["mcpServers"]


def test_write_json_config_overwrites_old_cf_mcp(tmp_path: Path):
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps({"mcpServers": {"cf-mcp": {"command": "old", "env": {"CF_API_TOKEN": "old"}}}})
    )

    assert _write_json_config(path, _make_mcp_config(command="/new/cf"))

    data = json.loads(path.read_text())
    assert data["mcpServers"]["cf-mcp"]["command"] == "/new/cf"


def test_write_json_config_fails_missing_parent(tmp_path: Path):
    assert not _write_json_config(tmp_path / "nope" / "config.json", _make_mcp_config())


# ── Unit: Codex TOML config writing ──


def test_write_codex_config_creates_new(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / ".codex").mkdir()

    assert _write_codex_config(_make_mcp_config())

    content = (tmp_path / ".codex" / "config.toml").read_text()
    assert "[mcp_servers.cf-mcp]" in content
    assert 'command = "/usr/local/bin/cf"' in content
    assert "[mcp_servers.cf-mcp.env]" in content
    assert 'CF_API_TOKEN = "test-token-123"' in content


def test_write_codex_config_preserves_existing_sections(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('model = "gpt-4"\n\n[features]\nunified_exec = true\n')

    assert _write_codex_config(_make_mcp_config())

    content = (codex_dir / "config.toml").read_text()
    assert 'model = "gpt-4"' in content
    assert "[features]" in content
    assert "[mcp_servers.cf-mcp]" in content


def test_write_codex_config_replaces_old_cf_mcp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text(
        'model = "gpt-4"\n\n'
        "[mcp_servers.cf-mcp]\n"
        'command = "old"\n\n'
        "[mcp_servers.cf-mcp.env]\n"
        'CF_API_TOKEN = "old-token"\n\n'
        "[mcp_servers.other]\n"
        'url = "https://example.com"\n'
    )

    assert _write_codex_config(_make_mcp_config(command="/new/cf"))

    content = (codex_dir / "config.toml").read_text()
    assert "old-token" not in content
    assert 'command = "/new/cf"' in content
    assert "[mcp_servers.other]" in content
    assert 'url = "https://example.com"' in content


def test_write_codex_config_includes_tunnel_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / ".codex").mkdir()

    assert _write_codex_config(_make_mcp_config(tunnel_id="tun-123"))

    content = (tmp_path / ".codex" / "config.toml").read_text()
    assert 'CLOUDFLARE_TUNNEL_ID = "tun-123"' in content


def test_write_codex_config_written_toml_is_parseable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """Written TOML must actually parse — not just look right."""
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text(
        'model = "gpt-4"\n\n[mcp_servers.context7]\nurl = "https://ctx7.com"\n'
    )

    assert _write_codex_config(_make_mcp_config(tunnel_id="tun-abc"))

    parsed = tomllib.loads((codex_dir / "config.toml").read_text())
    assert parsed["model"] == "gpt-4"
    assert parsed["mcp_servers"]["context7"]["url"] == "https://ctx7.com"
    assert parsed["mcp_servers"]["cf-mcp"]["command"] == "/usr/local/bin/cf"
    assert parsed["mcp_servers"]["cf-mcp"]["args"] == ["mcp"]
    assert parsed["mcp_servers"]["cf-mcp"]["env"]["CF_API_TOKEN"] == "test-token-123"
    assert parsed["mcp_servers"]["cf-mcp"]["env"]["CLOUDFLARE_TUNNEL_ID"] == "tun-abc"


# ═══════════════════════════════════════════════════════════════════
# Integration tests — these hit the real Cloudflare API
# They run when .env is present (conftest auto-loads it)
# ═══════════════════════════════════════════════════════════════════


async def test_gather_info_returns_active_token():
    """_gather_info verifies a real token and gets active status."""
    token = os.environ["CF_API_TOKEN"]
    info = await _gather_info(token)

    assert info["status"] == "active"


async def test_gather_info_returns_permissions():
    """_gather_info fetches real permission groups from the token."""
    token = os.environ["CF_API_TOKEN"]
    info = await _gather_info(token)

    assert len(info["permissions"]) > 0
    # Each permission should be a non-empty string
    assert all(isinstance(p, str) and len(p) > 0 for p in info["permissions"])


async def test_gather_info_detects_account():
    """_gather_info auto-detects the account from the API."""
    token = os.environ["CF_API_TOKEN"]
    info = await _gather_info(token)

    assert len(info["accounts"]) >= 1
    acct = info["accounts"][0]
    assert "id" in acct
    assert "name" in acct
    assert len(acct["id"]) > 0


async def test_gather_info_lists_zones():
    """_gather_info finds zones on the account."""
    token = os.environ["CF_API_TOKEN"]
    info = await _gather_info(token)

    assert len(info["zones"]) > 0
    zone = info["zones"][0]
    assert "name" in zone
    assert "." in zone["name"]  # it's a domain


async def test_gather_info_lists_tunnels():
    """_gather_info finds tunnels (list may be empty on some accounts)."""
    token = os.environ["CF_API_TOKEN"]
    info = await _gather_info(token)

    assert isinstance(info["tunnels"], list)
    if info["tunnels"]:
        tunnel = info["tunnels"][0]
        assert "id" in tunnel
        assert "name" in tunnel


# ── End-to-end: run_setup with simulated input, writing real configs ──


def test_run_setup_end_to_end_claude_code(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Full setup flow: real token → verify → write Claude Code config."""
    token = os.environ["CF_API_TOKEN"]

    # Point config to tmp_path
    claude_json = tmp_path / ".claude.json"
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()

    monkeypatch.setattr(Path, "home", lambda: tmp_path)

    # Simulate: paste token, select "1" (Claude Code only)
    with (
        patch("cf_mcp.setup.getpass", return_value=token),
        patch("builtins.input", return_value="1"),
    ):
        run_setup()

    # Verify the file was written
    assert claude_json.exists()
    data = json.loads(claude_json.read_text())
    server = data["mcpServers"]["cf-mcp"]
    assert server["env"]["CF_API_TOKEN"] == token
    assert server["args"] == ["mcp"]
    assert server["type"] == "stdio"
    assert len(server["command"]) > 0


def test_run_setup_end_to_end_codex(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Full setup flow: real token → verify → write Codex config."""
    token = os.environ["CF_API_TOKEN"]

    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    # Pre-populate with existing config
    (codex_dir / "config.toml").write_text('model = "gpt-5"\npersonality = "chill"\n')

    monkeypatch.setattr(Path, "home", lambda: tmp_path)

    with (
        patch("cf_mcp.setup.getpass", return_value=token),
        patch("builtins.input", return_value="3"),
    ):
        run_setup()

    content = (codex_dir / "config.toml").read_text()
    parsed = tomllib.loads(content)

    # Existing config preserved
    assert parsed["model"] == "gpt-5"
    assert parsed["personality"] == "chill"

    # cf-mcp added correctly
    cf = parsed["mcp_servers"]["cf-mcp"]
    assert cf["args"] == ["mcp"]
    assert cf["env"]["CF_API_TOKEN"] == token


def test_run_setup_end_to_end_all_clients(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Full setup flow: real token → verify → write ALL three client configs."""
    token = os.environ["CF_API_TOKEN"]

    monkeypatch.setattr(Path, "home", lambda: tmp_path)

    # Create directories for all clients
    (tmp_path / ".codex").mkdir()
    if sys.platform == "darwin":
        claude_desktop_dir = tmp_path / "Library" / "Application Support" / "Claude"
    else:
        claude_desktop_dir = tmp_path / ".config" / "claude"
    claude_desktop_dir.mkdir(parents=True)

    with (
        patch("cf_mcp.setup.getpass", return_value=token),
        patch("builtins.input", return_value="1,2,3"),
    ):
        run_setup()

    # Claude Code
    claude_json = tmp_path / ".claude.json"
    assert claude_json.exists()
    cc_data = json.loads(claude_json.read_text())
    assert cc_data["mcpServers"]["cf-mcp"]["env"]["CF_API_TOKEN"] == token
    assert cc_data["mcpServers"]["cf-mcp"]["type"] == "stdio"

    # Claude Desktop
    if sys.platform == "darwin":
        desktop_path = (
            tmp_path / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
        )
    else:
        desktop_path = tmp_path / ".config" / "claude" / "claude_desktop_config.json"
    assert desktop_path.exists()
    cd_data = json.loads(desktop_path.read_text())
    assert cd_data["mcpServers"]["cf-mcp"]["env"]["CF_API_TOKEN"] == token
    assert "type" not in cd_data["mcpServers"]["cf-mcp"]  # Desktop has no type field

    # Codex
    codex_toml = tmp_path / ".codex" / "config.toml"
    assert codex_toml.exists()
    codex_data = tomllib.loads(codex_toml.read_text())
    assert codex_data["mcp_servers"]["cf-mcp"]["env"]["CF_API_TOKEN"] == token


# ── End-to-end: run as subprocess (tests the actual CLI entry point) ──


def test_cf_setup_cli_help():
    """cf setup --help works without crashing."""
    result = subprocess.run(
        ["uv", "run", "cf", "--help"],
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0
    output = result.stdout + result.stderr
    assert "setup" in output


def test_cf_setup_no_token_exits():
    """cf setup exits cleanly when given empty token."""
    result = subprocess.run(
        ["uv", "run", "cf", "setup"],
        input="\n",  # empty token
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode != 0
    assert "No token" in result.stderr or "No token" in result.stdout
