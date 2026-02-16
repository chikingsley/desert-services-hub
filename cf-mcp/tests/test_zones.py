"""Integration tests for zone commands."""

from __future__ import annotations

from cf_mcp.client import CloudflareClient
from cf_mcp.commands.zones import list_zones


async def test_list_zones(client: CloudflareClient):
    zones = await list_zones(client)
    assert isinstance(zones, list)
    assert len(zones) > 0

    zone = zones[0]
    assert "id" in zone
    assert "name" in zone
    assert "status" in zone
    assert "plan" in zone
