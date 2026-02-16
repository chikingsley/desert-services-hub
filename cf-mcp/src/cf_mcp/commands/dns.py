"""DNS record management commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cf_mcp.client import CloudflareClient


async def list_records(
    client: CloudflareClient,
    zone: str,
    *,
    record_type: str | None = None,
    name: str | None = None,
) -> list[dict[str, Any]]:
    """List DNS records for a zone."""
    zone_id = await client.resolve_zone_id(zone)
    params: dict[str, Any] = {}
    if record_type:
        params["type"] = record_type.upper()
    if name:
        params["name"] = name

    records = await client.get_paginated(f"/zones/{zone_id}/dns_records", params=params)
    return [
        {
            "id": r["id"],
            "type": r["type"],
            "name": r["name"],
            "content": r["content"],
            "proxied": r.get("proxied", False),
            "ttl": r.get("ttl", 1),
        }
        for r in records
    ]


async def create_record(
    client: CloudflareClient,
    zone: str,
    name: str,
    record_type: str,
    content: str,
    *,
    proxied: bool = True,
    ttl: int = 1,
) -> dict[str, Any]:
    """Create a DNS record."""
    zone_id = await client.resolve_zone_id(zone)
    payload: dict[str, Any] = {
        "type": record_type.upper(),
        "name": name,
        "content": content,
        "proxied": proxied,
        "ttl": ttl,
    }
    result = await client.post(f"/zones/{zone_id}/dns_records", json=payload)
    return {
        "id": result["id"],
        "type": result["type"],
        "name": result["name"],
        "content": result["content"],
        "proxied": result.get("proxied", False),
    }


async def update_record(
    client: CloudflareClient,
    zone: str,
    record_id: str,
    *,
    content: str | None = None,
    proxied: bool | None = None,
    ttl: int | None = None,
) -> dict[str, Any]:
    """Update a DNS record."""
    zone_id = await client.resolve_zone_id(zone)

    # Fetch current record first
    current = await client.get(f"/zones/{zone_id}/dns_records/{record_id}")

    payload: dict[str, Any] = {
        "type": current["type"],
        "name": current["name"],
        "content": content if content is not None else current["content"],
        "proxied": proxied if proxied is not None else current.get("proxied", False),
        "ttl": ttl if ttl is not None else current.get("ttl", 1),
    }
    result = await client.put(f"/zones/{zone_id}/dns_records/{record_id}", json=payload)
    return {
        "id": result["id"],
        "type": result["type"],
        "name": result["name"],
        "content": result["content"],
        "proxied": result.get("proxied", False),
    }


async def delete_record(
    client: CloudflareClient,
    zone: str,
    record_id: str,
) -> dict[str, Any]:
    """Delete a DNS record."""
    zone_id = await client.resolve_zone_id(zone)
    result = await client.delete(f"/zones/{zone_id}/dns_records/{record_id}")
    return {"id": result.get("id", record_id), "deleted": True}
