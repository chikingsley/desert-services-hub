"""Typer CLI application."""

from __future__ import annotations

import asyncio
import functools
from typing import TYPE_CHECKING, Annotated, TypeVar

import typer

from cf_mcp.client import CloudflareClient, CloudflareError
from cf_mcp.config import get_settings
from cf_mcp.output import print_json, print_table

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from cf_mcp.config import Settings

app = typer.Typer(name="cf", help="Cloudflare CLI + MCP server.", no_args_is_help=True)
dns_app = typer.Typer(name="dns", help="DNS record management.", no_args_is_help=True)
tunnel_app = typer.Typer(name="tunnel", help="Tunnel management.", no_args_is_help=True)
ingress_app = typer.Typer(name="ingress", help="Tunnel ingress rules.", no_args_is_help=True)
workers_app = typer.Typer(name="workers", help="Workers script management.", no_args_is_help=True)
token_app = typer.Typer(name="token", help="API token management.", no_args_is_help=True)
zone_app = typer.Typer(name="zone", help="Zone management.", no_args_is_help=True)

app.add_typer(dns_app)
app.add_typer(tunnel_app)
app.add_typer(workers_app)
app.add_typer(token_app)
app.add_typer(zone_app)
tunnel_app.add_typer(ingress_app)

JsonFlag = Annotated[bool, typer.Option("--json", help="Output as JSON.")]

_T = TypeVar("_T")


def _run_with_client(
    coro_fn: Callable[[CloudflareClient, Settings], Awaitable[_T]],
) -> _T:
    """Create a client, run the async callable, and close the client."""
    settings = get_settings()

    async def _run() -> _T:
        async with CloudflareClient(settings) as client:
            return await coro_fn(client, settings)

    return asyncio.run(_run())


def _handle_errors(func):  # noqa: ANN001, ANN202
    """Decorator to handle API errors gracefully."""

    @functools.wraps(func)
    def wrapper(*args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        try:
            return func(*args, **kwargs)
        except (CloudflareError, ValueError) as e:
            typer.echo(f"Error: {e}", err=True)
            raise typer.Exit(1) from e

    return wrapper


# ── Zone commands ──


@zone_app.command("list")
@_handle_errors
def zone_list(
    json_output: JsonFlag = False,
) -> None:
    """List all zones."""
    from cf_mcp.commands.zones import list_zones

    zones = _run_with_client(lambda client, _: list_zones(client))

    if json_output:
        print_json(zones)
    else:
        print_table(
            ["ID", "Name", "Status", "Plan"],
            [[z["id"], z["name"], z["status"], z["plan"]] for z in zones],
        )


# ── DNS commands ──


@dns_app.command("list")
@_handle_errors
def dns_list(
    zone: str,
    record_type: Annotated[str | None, typer.Option("--type", help="Filter by type.")] = None,
    name: Annotated[str | None, typer.Option("--name", help="Filter by name.")] = None,
    json_output: JsonFlag = False,
) -> None:
    """List DNS records for a zone."""
    from cf_mcp.commands.dns import list_records

    records = _run_with_client(
        lambda client, _: list_records(client, zone, record_type=record_type, name=name)
    )

    if json_output:
        print_json(records)
    else:
        print_table(
            ["ID", "Type", "Name", "Content", "Proxied", "TTL"],
            [
                [r["id"], r["type"], r["name"], r["content"], str(r["proxied"]), str(r["ttl"])]
                for r in records
            ],
        )


@dns_app.command("create")
@_handle_errors
def dns_create(
    zone: str,
    name: str,
    record_type: Annotated[str, typer.Argument(help="Record type (A, CNAME, TXT, MX, etc.)")],
    content: str,
    proxy: Annotated[bool, typer.Option("--proxy/--no-proxy", help="Cloudflare proxy.")] = True,
    ttl: Annotated[int, typer.Option(help="TTL in seconds (1=auto).")] = 1,
    json_output: JsonFlag = False,
) -> None:
    """Create a DNS record."""
    from cf_mcp.commands.dns import create_record

    result = _run_with_client(
        lambda client, _: create_record(
            client, zone, name, record_type, content, proxied=proxy, ttl=ttl
        )
    )

    if json_output:
        print_json(result)
    else:
        typer.echo(f"Created: {result['type']} {result['name']} -> {result['content']}")


@dns_app.command("update")
@_handle_errors
def dns_update(
    zone: str,
    record_id: str,
    content: Annotated[str | None, typer.Option(help="New content.")] = None,
    proxy: Annotated[bool | None, typer.Option("--proxy/--no-proxy")] = None,
    ttl: Annotated[int | None, typer.Option(help="New TTL.")] = None,
    json_output: JsonFlag = False,
) -> None:
    """Update a DNS record."""
    from cf_mcp.commands.dns import update_record

    result = _run_with_client(
        lambda client, _: update_record(
            client, zone, record_id, content=content, proxied=proxy, ttl=ttl
        )
    )

    if json_output:
        print_json(result)
    else:
        typer.echo(f"Updated: {result['type']} {result['name']} -> {result['content']}")


@dns_app.command("delete")
@_handle_errors
def dns_delete(
    zone: str,
    record_id: str,
    json_output: JsonFlag = False,
) -> None:
    """Delete a DNS record."""
    from cf_mcp.commands.dns import delete_record

    result = _run_with_client(lambda client, _: delete_record(client, zone, record_id))

    if json_output:
        print_json(result)
    else:
        typer.echo(f"Deleted record: {result['id']}")


# ── Tunnel commands ──


@tunnel_app.command("list")
@_handle_errors
def tunnel_list(
    json_output: JsonFlag = False,
) -> None:
    """List all tunnels."""
    from cf_mcp.commands.tunnels import list_tunnels

    tunnels = _run_with_client(lambda client, settings: list_tunnels(client, settings))

    if json_output:
        print_json(tunnels)
    else:
        print_table(
            ["ID", "Name", "Status"],
            [[t["id"], t["name"], t["status"]] for t in tunnels],
        )


@ingress_app.command("list")
@_handle_errors
def ingress_list(
    tunnel_id: Annotated[str | None, typer.Option("--tunnel-id", help="Tunnel ID.")] = None,
    json_output: JsonFlag = False,
) -> None:
    """View ingress rules for a tunnel."""
    from cf_mcp.commands.tunnels import get_ingress

    rules = _run_with_client(lambda client, settings: get_ingress(client, settings, tunnel_id))

    if json_output:
        print_json(rules)
    else:
        print_table(
            ["Hostname", "Service"],
            [[r["hostname"], r["service"]] for r in rules],
        )


@ingress_app.command("add")
@_handle_errors
def ingress_add(
    hostname: str,
    service: str,
    tunnel_id: Annotated[str | None, typer.Option("--tunnel-id")] = None,
    json_output: JsonFlag = False,
) -> None:
    """Add an ingress rule."""
    from cf_mcp.commands.tunnels import add_ingress_rule

    rules = _run_with_client(
        lambda client, settings: add_ingress_rule(client, settings, hostname, service, tunnel_id)
    )

    if json_output:
        print_json(rules)
    else:
        typer.echo(f"Added: {hostname} -> {service}")
        print_table(
            ["Hostname", "Service"],
            [[r["hostname"], r["service"]] for r in rules],
        )


@ingress_app.command("remove")
@_handle_errors
def ingress_remove(
    hostname: str,
    tunnel_id: Annotated[str | None, typer.Option("--tunnel-id")] = None,
    json_output: JsonFlag = False,
) -> None:
    """Remove an ingress rule by hostname."""
    from cf_mcp.commands.tunnels import remove_ingress_rule

    rules = _run_with_client(
        lambda client, settings: remove_ingress_rule(client, settings, hostname, tunnel_id)
    )

    if json_output:
        print_json(rules)
    else:
        typer.echo(f"Removed: {hostname}")


# ── Workers commands ──


@workers_app.command("list")
@_handle_errors
def workers_list(
    json_output: JsonFlag = False,
) -> None:
    """List Workers scripts."""
    from cf_mcp.commands.workers import list_workers

    workers = _run_with_client(lambda client, _: list_workers(client))

    if json_output:
        print_json(workers)
    else:
        print_table(
            ["ID", "Modified"],
            [[w["id"], w["modified_on"]] for w in workers],
        )


@workers_app.command("info")
@_handle_errors
def workers_info(
    script_name: str,
    json_output: JsonFlag = False,
) -> None:
    """Get info for a Workers script."""
    from cf_mcp.commands.workers import get_worker_info

    info = _run_with_client(lambda client, _: get_worker_info(client, script_name))

    if json_output:
        print_json(info)
    else:
        for k, v in info.items():
            typer.echo(f"{k}: {v}")


# ── Token commands ──


@token_app.command("verify")
@_handle_errors
def token_verify(
    json_output: JsonFlag = False,
) -> None:
    """Verify the current API token."""
    from cf_mcp.commands.tokens import verify_token

    result = _run_with_client(lambda client, _: verify_token(client))

    if json_output:
        print_json(result)
    else:
        typer.echo(f"Token {result['id']}: {result['status']}")


@token_app.command("list")
@_handle_errors
def token_list(
    json_output: JsonFlag = False,
) -> None:
    """List all API tokens."""
    from cf_mcp.commands.tokens import list_tokens

    tokens = _run_with_client(lambda client, _: list_tokens(client))

    if json_output:
        print_json(tokens)
    else:
        print_table(
            ["ID", "Name", "Status"],
            [[t["id"], t["name"], t["status"]] for t in tokens],
        )


@token_app.command("permissions")
@_handle_errors
def token_permissions(
    token_id: str,
    json_output: JsonFlag = False,
) -> None:
    """Show permissions for a token."""
    from cf_mcp.commands.tokens import get_token_permissions

    result = _run_with_client(lambda client, _: get_token_permissions(client, token_id))

    if json_output:
        print_json(result)
    else:
        typer.echo(f"Token: {result['name']} ({result['id']}) [{result['status']}]")
        for policy in result.get("policies", []):
            typer.echo(f"  Effect: {policy['effect']}")
            for g in policy.get("permission_groups", []):
                typer.echo(f"    - {g['name']}")


@token_app.command("delete")
@_handle_errors
def token_delete(
    token_id: str,
    json_output: JsonFlag = False,
) -> None:
    """Delete an API token."""
    from cf_mcp.commands.tokens import delete_token

    result = _run_with_client(lambda client, _: delete_token(client, token_id))

    if json_output:
        print_json(result)
    else:
        typer.echo(f"Deleted token: {result['id']}")


# ── MCP server command ──


@app.command("mcp")
def mcp_serve() -> None:
    """Start the MCP server (stdio transport)."""
    from cf_mcp.server import mcp

    mcp.run()


@app.command("setup")
def setup() -> None:
    """Interactive setup wizard."""
    from cf_mcp.setup import run_setup

    run_setup()


def run() -> None:
    """Entry point for the `cf` command."""
    app()
