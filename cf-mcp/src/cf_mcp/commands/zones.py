"""Zone listing commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cf_mcp.client import CloudflareClient


async def list_zones(client: CloudflareClient) -> list[dict[str, Any]]:
    """List all zones on the account."""
    zones = await client.get_paginated("/zones")
    return [
        {
            "id": z["id"],
            "name": z["name"],
            "status": z["status"],
            "plan": z.get("plan", {}).get("name", ""),
        }
        for z in zones
    ]
