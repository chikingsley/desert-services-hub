"""API token management commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from cf_mcp.client import CloudflareClient


async def verify_token(client: CloudflareClient) -> dict[str, Any]:
    """Verify the current API token."""
    result = await client.get("/user/tokens/verify")
    return {
        "id": result.get("id", ""),
        "status": result.get("status", "unknown"),
    }


async def list_tokens(client: CloudflareClient) -> list[dict[str, Any]]:
    """List all API tokens."""
    tokens = await client.get_paginated("/user/tokens")
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "status": t["status"],
        }
        for t in tokens
    ]


async def get_token_permissions(
    client: CloudflareClient,
    token_id: str,
) -> dict[str, Any]:
    """Get permissions for a specific token."""
    result = await client.get(f"/user/tokens/{token_id}")
    policies = result.get("policies", [])
    return {
        "id": result["id"],
        "name": result["name"],
        "status": result["status"],
        "policies": [
            {
                "effect": p.get("effect", ""),
                "resources": p.get("resources", {}),
                "permission_groups": [
                    {"name": g.get("name", ""), "id": g.get("id", "")}
                    for g in p.get("permission_groups", [])
                ],
            }
            for p in policies
        ],
    }


async def delete_token(
    client: CloudflareClient,
    token_id: str,
) -> dict[str, Any]:
    """Delete an API token."""
    await client.delete(f"/user/tokens/{token_id}")
    return {"id": token_id, "deleted": True}
