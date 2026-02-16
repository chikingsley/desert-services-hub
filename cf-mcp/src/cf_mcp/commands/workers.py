"""Workers script management commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cf_mcp.client import CloudflareClient


async def list_workers(client: CloudflareClient) -> list[dict[str, Any]]:
    """List all Workers scripts."""
    acct = await client.resolve_account_id()
    workers = await client.get_paginated(f"/accounts/{acct}/workers/scripts")
    return [
        {
            "id": w.get("id", ""),
            "created_on": w.get("created_on", ""),
            "modified_on": w.get("modified_on", ""),
        }
        for w in workers
    ]


async def get_worker_info(
    client: CloudflareClient,
    script_name: str,
) -> dict[str, Any]:
    """Get details for a specific Workers script."""
    acct = await client.resolve_account_id()
    result = await client.get(f"/accounts/{acct}/workers/scripts/{script_name}")
    return {
        "id": result.get("id", script_name),
        "created_on": result.get("created_on", ""),
        "modified_on": result.get("modified_on", ""),
        "etag": result.get("etag", ""),
    }
