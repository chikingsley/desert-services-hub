# Contract Packet Lifecycle (2026-02-12)

## Why

`projects.contract_status` is too coarse (`Pending`, `Received`, `Sent Back`, `Executed`).
It does not answer operational questions like:
- do we have the packet files?
- what action is waiting now?
- how long since receipt?
- who owns the next step?

## Canonical Data Model

- `contract_packets`
  - one active packet workflow row per project (`is_active = true`)
  - lifecycle state + timestamps + owner + `next_action`
- `contract_packet_documents`
  - packet-to-document mapping for single PDF or multi-document bundles
- `contract_packet_queue_v`
  - queue view for operations with SLA clock fields

## Lifecycle States

- `requested`
- `received`
- `triage_in_progress`
- `ready_to_send_back`
- `sent_back`
- `awaiting_counterparty`
- `executed`
- `on_hold`
- `archived`

Packet shape (`packet_type`):
- `single_pdf`
- `multi_doc_packet`
- `mixed`
- `unknown`

## Core Queries

```sql
-- Queue for daily contract operations
SELECT project_id, project_name, status, packet_type, owner, next_action,
       received_at, sent_back_at, executed_at,
       minutes_since_received, is_sla_breached,
       packet_document_count, primary_contract_count
FROM contract_packet_queue_v
WHERE is_active = true
ORDER BY project_id;
```

```sql
-- Verify packet evidence for one project
SELECT cp.id AS packet_id, cp.status, cp.packet_type,
       d.id AS document_id, d.document_type, d.file_name, d.file_path,
       d.email_id, d.attachment_id
FROM contract_packets cp
LEFT JOIN contract_packet_documents cpd ON cpd.packet_id = cp.id
LEFT JOIN documents d ON d.id = cpd.document_id
WHERE cp.project_id = $1
  AND cp.is_active = true
ORDER BY d.created_at DESC NULLS LAST;
```

## Migration

Implemented in:
- `supabase/migrations/20260212170000_contract_packet_lifecycle.sql`

Includes bootstrap backfill from existing `projects.contract_status` so current projects have an active packet row immediately.
