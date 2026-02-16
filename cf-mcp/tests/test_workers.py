"""Integration tests for workers commands."""

from __future__ import annotations

from cf_mcp.client import CloudflareClient
from cf_mcp.commands.workers import list_workers


async def test_list_workers(client: CloudflareClient):
    workers = await list_workers(client)
    assert isinstance(workers, list)
    if workers:
        w = workers[0]
        assert "id" in w
        assert "modified_on" in w
