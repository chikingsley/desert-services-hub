"""Integration tests for token commands."""

from __future__ import annotations

from cf_mcp.client import CloudflareClient
from cf_mcp.commands.tokens import get_token_permissions, list_tokens, verify_token


async def test_verify_token(client: CloudflareClient):
    result = await verify_token(client)
    assert result["status"] == "active"
    assert "id" in result


async def test_list_tokens(client: CloudflareClient):
    tokens = await list_tokens(client)
    assert isinstance(tokens, list)
    assert len(tokens) > 0

    t = tokens[0]
    assert "id" in t
    assert "name" in t
    assert "status" in t


async def test_token_permissions(client: CloudflareClient):
    tokens = await list_tokens(client)
    token_id = tokens[0]["id"]

    perms = await get_token_permissions(client, token_id)
    assert "id" in perms
    assert "name" in perms
    assert "policies" in perms
    assert isinstance(perms["policies"], list)
