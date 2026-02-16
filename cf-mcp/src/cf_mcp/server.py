"""FastMCP server exposing Cloudflare operations as MCP tools."""

from __future__ import annotations

from fastmcp import FastMCP

from cf_mcp.client import CloudflareClient
from cf_mcp.config import get_settings

mcp = FastMCP("cf-mcp", instructions="Cloudflare management: DNS, tunnels, workers, tokens.")


# ── Zone tools ──


@mcp.tool()
async def zone_list() -> list[dict]:
    """List all Cloudflare zones on the account."""
    from cf_mcp.commands.zones import list_zones

    async with CloudflareClient(get_settings()) as client:
        return await list_zones(client)


# ── DNS tools ──


@mcp.tool()
async def dns_list(zone: str, record_type: str | None = None) -> list[dict]:
    """List DNS records for a zone. Zone can be a domain name like 'peacockery.studio'."""
    from cf_mcp.commands.dns import list_records

    async with CloudflareClient(get_settings()) as client:
        return await list_records(client, zone, record_type=record_type)


@mcp.tool()
async def dns_create(
    zone: str,
    name: str,
    record_type: str,
    content: str,
    proxied: bool = True,
    ttl: int = 1,
) -> dict:
    """Create a DNS record. Zone is a domain name. Type is A, CNAME, TXT, MX, etc."""
    from cf_mcp.commands.dns import create_record

    async with CloudflareClient(get_settings()) as client:
        return await create_record(
            client, zone, name, record_type, content, proxied=proxied, ttl=ttl
        )


@mcp.tool()
async def dns_update(
    zone: str,
    record_id: str,
    content: str | None = None,
    proxied: bool | None = None,
    ttl: int | None = None,
) -> dict:
    """Update a DNS record by ID."""
    from cf_mcp.commands.dns import update_record

    async with CloudflareClient(get_settings()) as client:
        return await update_record(
            client, zone, record_id, content=content, proxied=proxied, ttl=ttl
        )


@mcp.tool()
async def dns_delete(zone: str, record_id: str) -> dict:
    """Delete a DNS record by ID."""
    from cf_mcp.commands.dns import delete_record

    async with CloudflareClient(get_settings()) as client:
        return await delete_record(client, zone, record_id)


# ── Tunnel tools ──


@mcp.tool()
async def tunnel_list() -> list[dict]:
    """List all Cloudflare tunnels."""
    from cf_mcp.commands.tunnels import list_tunnels

    settings = get_settings()
    async with CloudflareClient(settings) as client:
        return await list_tunnels(client, settings)


@mcp.tool()
async def tunnel_ingress(tunnel_id: str | None = None) -> list[dict]:
    """Get ingress rules for a tunnel. Uses default tunnel if not specified."""
    from cf_mcp.commands.tunnels import get_ingress

    settings = get_settings()
    async with CloudflareClient(settings) as client:
        return await get_ingress(client, settings, tunnel_id)


@mcp.tool()
async def tunnel_ingress_add(
    hostname: str, service: str, tunnel_id: str | None = None
) -> list[dict]:
    """Add an ingress rule to a tunnel. Returns updated ingress list."""
    from cf_mcp.commands.tunnels import add_ingress_rule

    settings = get_settings()
    async with CloudflareClient(settings) as client:
        return await add_ingress_rule(client, settings, hostname, service, tunnel_id)


@mcp.tool()
async def tunnel_ingress_remove(hostname: str, tunnel_id: str | None = None) -> list[dict]:
    """Remove an ingress rule by hostname. Returns updated ingress list."""
    from cf_mcp.commands.tunnels import remove_ingress_rule

    settings = get_settings()
    async with CloudflareClient(settings) as client:
        return await remove_ingress_rule(client, settings, hostname, tunnel_id)


# ── Workers tools ──


@mcp.tool()
async def workers_list() -> list[dict]:
    """List all Workers scripts."""
    from cf_mcp.commands.workers import list_workers

    async with CloudflareClient(get_settings()) as client:
        return await list_workers(client)


# ── Token tools ──


@mcp.tool()
async def token_verify() -> dict:
    """Verify the current API token is valid."""
    from cf_mcp.commands.tokens import verify_token

    async with CloudflareClient(get_settings()) as client:
        return await verify_token(client)


@mcp.tool()
async def token_list() -> list[dict]:
    """List all API tokens on the account."""
    from cf_mcp.commands.tokens import list_tokens

    async with CloudflareClient(get_settings()) as client:
        return await list_tokens(client)


@mcp.tool()
async def token_permissions(token_id: str) -> dict:
    """Show permissions for a specific API token."""
    from cf_mcp.commands.tokens import get_token_permissions

    async with CloudflareClient(get_settings()) as client:
        return await get_token_permissions(client, token_id)
