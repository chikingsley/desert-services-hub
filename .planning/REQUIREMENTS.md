# Requirements: Contract Cascade

**Defined:** 2026-01-22
**Core Value:** When a contract arrives, the right tasks spawn with the right context, and people can just execute.

## v1 Requirements

### Folder Trigger

- [x] **TRIG-01**: System watches a folder for new PDF files
- [x] **TRIG-02**: New PDF detection triggers processing pipeline
- [x] **TRIG-03**: Supports local folder (can add SharePoint later)

### OCR & Text Extraction

- [x] **OCR-01**: PDF is OCR'd using Mistral to extract text
- [x] **OCR-02**: Text extraction handles both digital and scanned PDFs
- [x] **OCR-03**: Extracted text is stored for multi-agent processing

### Multi-Agent Extraction

**All extractions include page number / section citation for human verification.**

- [x] **EXTR-01**: Contract Info agent extracts: contract type (LOI/Subcontract/Work Order/Amendment), contract date, contract value, project name, project address, start/end dates
- [x] **EXTR-02**: Billing agent extracts: retention %, billing platform (Textura/Procore/GCPay/Premier/Email/Other), billing window, billing contact, certified payroll required (yes/no), certified payroll type (Davis-Bacon/HUD/State Prevailing Wage/None)
- [x] **EXTR-03**: Contacts agent extracts: PM (name, phone, email), superintendent (name, phone, email)
- [x] **EXTR-04**: Schedule of Values agent extracts: SOV included (yes/no), line items exactly as stated, scope summary items
- [x] **EXTR-05**: Insurance agent extracts: GL limits, umbrella limits, auto limits, workers comp limits, COI required, additional insured, waiver of subrogation, primary & non-contributory, bonding requirements
- [x] **EXTR-06**: Site Info agent extracts: site address, site hours, access instructions, safety requirements
- [x] **EXTR-07**: Red Flags agent detects: unusual/concerning terms, maintenance language, T&M language, vague language, missing required info checklist
- [x] **EXTR-08**: Agents run in parallel for speed
- [x] **EXTR-09**: Each agent produces structured output (validated with Zod)
- [x] **EXTR-10**: Each extraction includes page/section citation

### Monday Matching

- [ ] **MATCH-01**: System fuzzy-matches contract to Monday ESTIMATING board
- [ ] **MATCH-02**: Uses project name + contractor for matching
- [ ] **MATCH-03**: If confidence high (>0.8), auto-selects match
- [ ] **MATCH-04**: If confidence low, presents top 3-5 options for human selection
- [ ] **MATCH-05**: Links contract to matched estimate

### Notion Integration

- [ ] **NOTION-01**: System creates project row in Notion database
- [ ] **NOTION-02**: Project row has task-step columns with 3 statuses (N/A, To Do, Done): Reconciled, Contractor Emailed, QuickBooks Updated, Monday Updated, Team Notified, Dust Permit Started, SWPPP Ordered, SharePoint Updated
- [ ] **NOTION-03**: Project page contains all extracted context (organized by extraction agent)
- [ ] **NOTION-04**: Project page links to source PDF
- [ ] **NOTION-05**: Task columns default based on contract type (e.g., Dust Permit N/A if not detected)
- [ ] **NOTION-06**: Deduplication prevents duplicate projects for same contract

### Human Verification

- [ ] **VERIFY-01**: Extracted data visible in Notion page with citations
- [ ] **VERIFY-02**: Human can edit/correct extracted data before acting
- [ ] **VERIFY-03**: Low-confidence extractions flagged for review

## v2 Requirements

### Email Monitoring

- **EMAIL-01**: System monitors <contracts@desertservices.net> for new emails
- **EMAIL-02**: Classifies emails as contract vs non-contract
- **EMAIL-03**: Dual-path monitoring (webhooks + polling fallback)
- **EMAIL-04**: Heartbeat alerts when monitoring fails

### DocuSign Integration

- **DOCU-01**: System detects DocuSign notification emails
- **DOCU-02**: Automatically downloads completed contract PDFs from DocuSign
- **DOCU-03**: Feeds downloaded PDFs into processing pipeline

### Context Engine

- **CTX-01**: Central context database syncing emails and Monday data
- **CTX-02**: Automatic linking of related items across systems
- **CTX-03**: Project follow-up tracking for all projects (not just active)

### Downstream Tasks

- **DOWNSTREAM-01**: Task dependencies (sequential flow)
- **DOWNSTREAM-02**: Signs ordering triggered by NOI/dust permit completion
- **DOWNSTREAM-03**: Narrative generation triggered by prerequisite completion
- **DOWNSTREAM-04**: Installation tracking with contractor confirmation

### Metrics

- **METRICS-01**: Turnaround time from contract drop to all steps complete
- **METRICS-02**: Extraction accuracy tracking
- **METRICS-03**: Human correction rate (measures extraction quality)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time email webhooks | Adds complexity, manual folder drop sufficient for v1 |
| DocuSign auto-download | Integration not solved yet, could take weeks |
| Separate task database | Overcomplicated; columns on project row is simpler |
| Agent automation of task execution | v1 is human scaffolding, agents come later |
| Mobile app | Notion mobile access is sufficient |
| Line-item reconciliation logic | Human does this; system provides context |
| Context engine | V2 - need v1 working first |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRIG-01 | Phase 1 | Complete |
| TRIG-02 | Phase 1 | Complete |
| TRIG-03 | Phase 1 | Complete |
| OCR-01 | Phase 2 | Complete |
| OCR-02 | Phase 2 | Complete |
| OCR-03 | Phase 2 | Complete |
| EXTR-01 | Phase 3 | Complete |
| EXTR-02 | Phase 3 | Complete |
| EXTR-03 | Phase 3 | Complete |
| EXTR-04 | Phase 3 | Complete |
| EXTR-05 | Phase 3 | Complete |
| EXTR-06 | Phase 3 | Complete |
| EXTR-07 | Phase 3 | Complete |
| EXTR-08 | Phase 3 | Complete |
| EXTR-09 | Phase 3 | Complete |
| EXTR-10 | Phase 3 | Complete |
| MATCH-01 | Phase 4 | Pending |
| MATCH-02 | Phase 4 | Pending |
| MATCH-03 | Phase 4 | Pending |
| MATCH-04 | Phase 4 | Pending |
| MATCH-05 | Phase 4 | Pending |
| NOTION-01 | Phase 5 | Pending |
| NOTION-02 | Phase 5 | Pending |
| NOTION-03 | Phase 5 | Pending |
| NOTION-04 | Phase 5 | Pending |
| NOTION-05 | Phase 5 | Pending |
| NOTION-06 | Phase 5 | Pending |
| VERIFY-01 | Phase 5 | Pending |
| VERIFY-02 | Phase 5 | Pending |
| VERIFY-03 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-23 after Phase 3 completion*
