"""Integration tests for DNS commands."""

from __future__ import annotations

import pytest

from cf_mcp.client import CloudflareClient
from cf_mcp.commands.dns import create_record, delete_record, list_records, update_record


async def test_list_records(client: CloudflareClient, test_zone: str):
    records = await list_records(client, test_zone)
    assert isinstance(records, list)
    assert len(records) > 0

    rec = records[0]
    assert "id" in rec
    assert "type" in rec
    assert "name" in rec
    assert "content" in rec


async def test_list_records_filter_type(client: CloudflareClient, test_zone: str):
    records = await list_records(client, test_zone, record_type="A")
    assert isinstance(records, list)
    for rec in records:
        assert rec["type"] == "A"


async def test_crud_txt_record(client: CloudflareClient, test_zone: str):
    """Create, update, and delete a TXT record."""
    # Create
    created = await create_record(
        client,
        test_zone,
        name=f"_cf-mcp-test.{test_zone}",
        record_type="TXT",
        content="integration-test-v1",
        proxied=False,
        ttl=120,
    )
    assert created["type"] == "TXT"
    assert "integration-test-v1" in created["content"]
    record_id = created["id"]

    try:
        # Update
        updated = await update_record(
            client,
            test_zone,
            record_id,
            content="integration-test-v2",
        )
        assert updated["id"] == record_id
        assert "integration-test-v2" in updated["content"]
    finally:
        # Delete (always clean up)
        result = await delete_record(client, test_zone, record_id)
        assert result["deleted"] is True


async def test_resolve_zone_id_invalid(client: CloudflareClient):
    with pytest.raises(ValueError, match="not found"):
        await client.resolve_zone_id("nonexistent-zone.invalid")
