"""Integration tests for tunnel commands."""

from __future__ import annotations

from cf_mcp.client import CloudflareClient
from cf_mcp.commands.tunnels import get_ingress, list_tunnels
from cf_mcp.config import Settings


async def test_list_tunnels(client: CloudflareClient, settings: Settings):
    tunnels = await list_tunnels(client, settings)
    assert isinstance(tunnels, list)
    if tunnels:
        t = tunnels[0]
        assert "id" in t
        assert "name" in t
        assert "status" in t


async def test_get_ingress(client: CloudflareClient, settings: Settings):
    rules = await get_ingress(client, settings)
    assert isinstance(rules, list)
    if rules:
        rule = rules[0]
        assert "hostname" in rule
        assert "service" in rule
