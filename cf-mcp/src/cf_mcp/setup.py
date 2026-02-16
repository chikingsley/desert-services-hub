"""Interactive setup wizard for cf-mcp."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import shutil
import sys
from getpass import getpass
from pathlib import Path
from typing import Any

import typer

from cf_mcp.client import CloudflareClient, CloudflareError
from cf_mcp.config import Settings

REQUIRED_PERMS = [
    ("Zone Read", "zone listing and name resolution"),
    ("DNS", "DNS record management"),
    ("Cloudflare Tunnel", "tunnel and ingress management"),
    ("Workers Scripts", "Workers listing and info"),
    ("API Tokens", "token management commands"),
]


async def _gather_info(token: str) -> dict[str, Any]:
    """Verify token and gather account info."""
    settings = Settings(cf_api_token=token)

    async with CloudflareClient(settings) as client:
        # Verify token
        verify_result = await client.get("/user/tokens/verify")
        token_id = verify_result.get("id", "")
        status = verify_result.get("status", "unknown")

        # Get permission groups
        perm_names: list[str] = []
        try:
            detail = await client.get(f"/user/tokens/{token_id}")
            for policy in detail.get("policies", []):
                for group in policy.get("permission_groups", []):
                    name = group.get("name", "")
                    if name:
                        perm_names.append(name)
        except CloudflareError:
            pass

        # List accounts
        accounts: list[dict[str, Any]] = []
        with contextlib.suppress(CloudflareError):
            accounts = await client.get_paginated("/accounts")

        # List zones
        zones: list[dict[str, Any]] = []
        with contextlib.suppress(CloudflareError):
            zones = await client.get_paginated("/zones")

        # List tunnels (needs account ID)
        tunnels: list[dict[str, Any]] = []
        if accounts:
            with contextlib.suppress(CloudflareError):
                tunnels = await client.get_paginated(
                    f"/accounts/{accounts[0]['id']}/cfd_tunnel",
                    params={"is_deleted": "false"},
                )

        return {
            "status": status,
            "permissions": perm_names,
            "accounts": accounts,
            "zones": zones,
            "tunnels": tunnels,
        }


def _check_permissions(perm_names: list[str]) -> list[tuple[str, str, bool]]:
    """Check which required permissions are present."""
    results = []
    for keyword, description in REQUIRED_PERMS:
        found = any(keyword.lower() in p.lower() for p in perm_names)
        results.append((keyword, description, found))
    return results


def _is_temporary_path(path: str) -> bool:
    """Check if a path is in a temporary or cache directory."""
    import tempfile

    tmp = tempfile.gettempdir()
    return path.startswith(tmp) or "/.cache/uv/archive" in path


def _find_cf_binary() -> str:
    """Find the cf binary path, preferring permanent installs."""
    path = shutil.which("cf")
    if path and not _is_temporary_path(path):
        return path
    return "cf"


def _desktop_config_path() -> Path:
    """Return the Claude Desktop config path for the current platform."""
    if sys.platform == "darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / "Claude"
            / "claude_desktop_config.json"
        )
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", "")) / "Claude" / "claude_desktop_config.json"
    return Path.home() / ".config" / "claude" / "claude_desktop_config.json"


def _display_path(path: Path) -> str:
    """Show a path relative to home for readability."""
    try:
        return f"~/{path.relative_to(Path.home())}"
    except ValueError:
        return str(path)


def _write_json_config(path: Path, server_config: dict[str, Any]) -> bool:
    """Write MCP server config into a JSON config file."""
    try:
        if path.exists():
            data = json.loads(path.read_text())
        else:
            if not path.parent.exists():
                typer.echo(f"    Skipped — {path.parent} not found")
                return False
            data = {}

        if "mcpServers" not in data:
            data["mcpServers"] = {}
        data["mcpServers"]["cf-mcp"] = server_config
        path.write_text(json.dumps(data, indent=2) + "\n")
        return True
    except Exception as e:
        typer.echo(f"    Error: {e}", err=True)
        return False


def _write_codex_config(config: dict[str, Any]) -> bool:
    """Write MCP server config into Codex TOML config."""
    path = Path.home() / ".codex" / "config.toml"

    try:
        if path.exists():
            content = path.read_text()
        else:
            if not path.parent.exists():
                typer.echo(f"    Skipped — {path.parent} not found")
                return False
            content = ""

        # Remove existing cf-mcp sections (line-by-line)
        lines = content.split("\n")
        result_lines: list[str] = []
        skip = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                section = stripped[1:-1].strip()
                if section == "mcp_servers.cf-mcp" or section.startswith("mcp_servers.cf-mcp."):
                    skip = True
                    continue
                skip = False
            if not skip:
                result_lines.append(line)

        content = "\n".join(result_lines).rstrip() + "\n"

        # Build new section
        cmd = config["command"]
        token = config["env"]["CF_API_TOKEN"]
        section = f'\n[mcp_servers.cf-mcp]\ncommand = "{cmd}"\nargs = ["mcp"]\n'
        section += f'\n[mcp_servers.cf-mcp.env]\nCF_API_TOKEN = "{token}"\n'
        if tid := config["env"].get("CLOUDFLARE_TUNNEL_ID"):
            section += f'CLOUDFLARE_TUNNEL_ID = "{tid}"\n'

        path.write_text(content + section)
        return True
    except Exception as e:
        typer.echo(f"    Error: {e}", err=True)
        return False


def run_setup() -> None:
    """Interactive setup wizard for cf-mcp."""
    typer.echo("cf-mcp setup\n")

    # Instructions
    typer.echo("Create a Custom Token at:")
    typer.echo("  https://dash.cloudflare.com/profile/api-tokens\n")
    typer.echo("Minimum permissions:")
    typer.echo("  Zone | Zone | Read")
    typer.echo("  Zone | DNS | Edit")
    typer.echo("  Account | Cloudflare Tunnel | Edit")
    typer.echo("  Account | Workers Scripts | Edit")
    typer.echo("  User | API Tokens | Read  (optional)\n")

    # Get token
    token = getpass("Paste API token: ").strip()
    if not token:
        typer.echo("No token provided.", err=True)
        raise typer.Exit(1)

    # Verify and gather info
    typer.echo("\nVerifying...")
    try:
        info = asyncio.run(_gather_info(token))
    except (CloudflareError, ValueError) as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(1) from e

    if info["status"] != "active":
        typer.echo(f"Token status: {info['status']} (expected 'active')", err=True)
        raise typer.Exit(1)

    typer.echo(f"  Token: {info['status']} ✓")

    # Permissions
    if info["permissions"]:
        typer.echo("\nPermissions:")
        for name, desc, found in _check_permissions(info["permissions"]):
            if found:
                typer.echo(f"  ✓ {name}")
            else:
                typer.echo(f"  ✗ {name} — {desc} won't work")

    # Account
    accounts = info["accounts"]
    if accounts:
        typer.echo(f"\nAccount: {accounts[0]['name']}")

    # Zones
    zones = info["zones"]
    if zones:
        names = ", ".join(z["name"] for z in zones[:5])
        extra = f" (+{len(zones) - 5} more)" if len(zones) > 5 else ""
        typer.echo(f"Zones: {len(zones)} — {names}{extra}")

    # Tunnels
    tunnels = info["tunnels"]
    tunnel_id = ""
    if tunnels:
        names = ", ".join(t["name"] for t in tunnels[:3])
        typer.echo(f"Tunnels: {len(tunnels)} — {names}")
        if len(tunnels) == 1:
            tunnel_id = tunnels[0]["id"]

    # MCP client selection
    desktop_path = _desktop_config_path()
    clients = [
        ("Claude Code", Path.home() / ".claude.json"),
        ("Claude Desktop", desktop_path),
        ("Codex", Path.home() / ".codex" / "config.toml"),
    ]

    typer.echo("\nConfigure MCP clients:")
    for i, (name, path) in enumerate(clients, 1):
        typer.echo(f"  [{i}] {name} ({_display_path(path)})")

    selection = input("\nEnter numbers, comma-separated (e.g. 1,2,3): ").strip()
    if not selection:
        typer.echo("No clients selected.")
        raise typer.Exit(0)

    try:
        indices = [int(s.strip()) for s in selection.split(",")]
    except ValueError:
        typer.echo("Invalid input.", err=True)
        raise typer.Exit(1) from None

    # Build config
    cf_binary = _find_cf_binary()
    env: dict[str, str] = {"CF_API_TOKEN": token}
    if tunnel_id:
        env["CLOUDFLARE_TUNNEL_ID"] = tunnel_id

    mcp_config = {"command": cf_binary, "args": ["mcp"], "env": env}

    typer.echo()
    for idx in indices:
        if idx < 1 or idx > len(clients):
            continue
        name, _ = clients[idx - 1]

        ok = False
        if idx == 1:  # Claude Code
            ok = _write_json_config(
                Path.home() / ".claude.json",
                {**mcp_config, "type": "stdio"},
            )
        elif idx == 2:  # Claude Desktop
            ok = _write_json_config(desktop_path, mcp_config)
        elif idx == 3:  # Codex
            ok = _write_codex_config(mcp_config)

        mark = "✓" if ok else "✗"
        typer.echo(f"  {mark} {name}")

    typer.echo("\nDone! Restart your MCP client to connect.")
