# Contract Processing - Current State

**Updated:** 2026-02-16
**Architecture:** See `ARCHITECTURE.md` for the full pipeline map with gaps.

---

## What's Working

### Automated (Running Now)

- **Email storage:** Emails to contracts@ are captured in `emails` table with attachments downloaded
- **Project creation:** Estimate sync auto-creates projects from Monday.com estimates (~60s poll)
- **Project-estimate linking:** `project_estimates` join table maintained automatically
- **Intake pipeline:** When emails are manually forwarded to intake@, full OCR + classification + linking works
- **Document classifier:** Heuristic classifier detects contract, subcontract, sov, insurance, po, plan_set, noi, etc.
- **Contract packet schema:** `contract_packets` + `contract_packet_documents` tables with lifecycle states + SLA tracking
- **SOV master:** `project_sov_master` + revision history for canonical estimate-based SOV
- **Web UI:** Contracts list with search, filter, sort, detail panel

### Manual Steps Required

- **Email classification:** Must manually classify emails as CONTRACT in web UI
- **Attachment processing:** Must forward to intake@ to trigger parsing (emails from contracts@ don't auto-process)
- **Project linking:** Contract emails aren't auto-linked to projects (folder watcher only watches Projects/Active/)
- **Packet creation:** No auto-creation of contract_packets when contract arrives
- **SOV comparison:** No automated line-item extraction from contract PDFs

---

## Current Test Case: Redpoint Headquarters

First real contract to test the pipeline: `"1000 - Subcontrat.002 - SWPPP ($7,930.00) - Redpoint Headquarters."`

| What | Status |
|------|--------|
| Email stored (7 copies) | ✅ |
| Attachments downloaded (3 files × 7) | ✅ but `extraction_status = 'pending'` |
| Project exists (#24243) | ✅ |
| Estimate linked (02112623) | ✅ but `bid_status` still "Bid Sent" |
| Email classified | ❌ NULL |
| Email linked to project | ❌ NULL |
| Documents parsed | ❌ None in `documents` table |
| Contract packet | ❌ None exists |

---

## Priority Gaps (From ARCHITECTURE.md)

1. **Gap 1:** Contract emails don't trigger any processing after storage
2. **Gap 2:** No email-to-project linking for contracts folder
3. **Gap 3:** No auto-creation of contract packets
4. **Gap 4:** No SOV extraction from contract PDFs for comparison
5. **Gap 5:** No automated outgoing document generation

---

## Related Docs

- `ARCHITECTURE.md` - Full pipeline map, data flow, file references, gap analysis
- `docs/post-contract-process.md` - Stage-by-stage process after packet receipt
- `docs/contract-packet-lifecycle-2026-02-12.md` - Packet model specification
- `WORKFLOW.md` - Detailed workflow with anti-hallucination measures
- `contracts-master.md` - 15-step process checklist
- `templates/` - GC response, internal handoff, extraction, reconciliation templates
