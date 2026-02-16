"""Tunnel management commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cf_mcp.client import CloudflareClient
    from cf_mcp.config import Settings


async def list_tunnels(
    client: CloudflareClient,
    settings: Settings,
) -> list[dict[str, Any]]:
    """List all tunnels on the account."""
    acct = await client.resolve_account_id()
    tunnels = await client.get_paginated(
        f"/accounts/{acct}/cfd_tunnel",
        params={"is_deleted": "false"},
    )
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "status": t.get("status", "unknown"),
            "created_at": t.get("created_at", ""),
        }
        for t in tunnels
    ]


async def get_ingress(
    client: CloudflareClient,
    settings: Settings,
    tunnel_id: str | None = None,
) -> list[dict[str, Any]]:
    """Get ingress rules for a tunnel."""
    acct = await client.resolve_account_id()
    tid = tunnel_id or settings.tunnel_id
    if not tid:
        msg = "No tunnel ID provided. Set CLOUDFLARE_TUNNEL_ID or pass --tunnel-id."
        raise ValueError(msg)

    result = await client.get(f"/accounts/{acct}/cfd_tunnel/{tid}/configurations")
    config = result.get("config", {})
    ingress_rules = config.get("ingress", [])
    return [
        {
            "hostname": r.get("hostname", "(catch-all)"),
            "service": r.get("service", ""),
            "path": r.get("path", ""),
        }
        for r in ingress_rules
    ]


async def add_ingress_rule(
    client: CloudflareClient,
    settings: Settings,
    hostname: str,
    service: str,
    tunnel_id: str | None = None,
) -> list[dict[str, Any]]:
    """Add an ingress rule to a tunnel."""
    acct = await client.resolve_account_id()
    tid = tunnel_id or settings.tunnel_id
    if not tid:
        msg = "No tunnel ID provided."
        raise ValueError(msg)

    # Get current config
    result = await client.get(f"/accounts/{acct}/cfd_tunnel/{tid}/configurations")
    config = result.get("config", {})
    ingress = config.get("ingress", [])

    # Insert before the catch-all (last rule)
    new_rule = {"hostname": hostname, "service": service}
    if ingress and not ingress[-1].get("hostname"):
        ingress.insert(-1, new_rule)
    else:
        ingress.append(new_rule)

    # Update
    await client.put(
        f"/accounts/{acct}/cfd_tunnel/{tid}/configurations",
        json={"config": {**config, "ingress": ingress}},
    )

    return await get_ingress(client, settings, tid)


async def remove_ingress_rule(
    client: CloudflareClient,
    settings: Settings,
    hostname: str,
    tunnel_id: str | None = None,
) -> list[dict[str, Any]]:
    """Remove an ingress rule from a tunnel by hostname."""
    acct = await client.resolve_account_id()
    tid = tunnel_id or settings.tunnel_id
    if not tid:
        msg = "No tunnel ID provided."
        raise ValueError(msg)

    result = await client.get(f"/accounts/{acct}/cfd_tunnel/{tid}/configurations")
    config = result.get("config", {})
    ingress = config.get("ingress", [])

    original_len = len(ingress)
    ingress = [r for r in ingress if r.get("hostname") != hostname]

    if len(ingress) == original_len:
        msg = f"No ingress rule found for hostname '{hostname}'."
        raise ValueError(msg)

    await client.put(
        f"/accounts/{acct}/cfd_tunnel/{tid}/configurations",
        json={"config": {**config, "ingress": ingress}},
    )

    return await get_ingress(client, settings, tid)
