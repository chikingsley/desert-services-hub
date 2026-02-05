# File Naming Convention

**Date Format:** `YYMMDD` (6 digits, no dashes)

---

## Document Numbers

Many documents have identifying numbers that should be included in filenames when present:

- **PO Number** - Purchase Order number from contractor
- **Job Number** - Internal or contractor job/project number
- **Contract Number** - Contract ID (e.g., `1730001-001`, `C-0001`)
- **Estimate Number** - Our estimate ID (e.g., `EST-1234`, `22-014`)

When a document has an identifying number, include it in the filename.

---

## Estimates

**Format:** `Estimate-[EstimateID]R[#]-[Contractor]-[Project]-[Services].pdf`

- Estimate ID = our internal ID or date-based ID (e.g., `09022502`, `EST-1234`)
- Always include revision: `R0` for original, `R1`, `R2`, etc.
- Use underscores for spaces in names
- Lowercase service tags
- Include project name when available

| Example | Description |
|---------|-------------|
| `Estimate-09022502R0-EOS_Builders-Helen_Drake_Village-swppp.pdf` | Original SWPPP estimate |
| `Estimate-EST1234R1-Caliente-Kiwanis_Playground-swppp.pdf` | First revision |
| `Estimate-12150301R0-BPR_Companies-PV_Phase5-swppp-tf-dc.pdf` | Multi-service |

---

## Contracts

**Format:** `Contract-[YYMMDD]-[DocNumber]-[Contractor]-[Project]-[Services]R[#].pdf`

- Date = signing date
- DocNumber = contract number, PO number, or job number (if available)
- Include service tags
- Always include revision starting at `R0`

| Example | Description |
|---------|-------------|
| `Contract-250102-1730001-001-NFC_LLC-Good_Day_Gilbert-swpppR0.pdf` | With contract number |
| `Contract-250315-PO12345-Caliente-Kiwanis_Playground-swppp-tf-dcR0.pdf` | With PO number |
| `Contract-250315-Caliente-Kiwanis_Playground-swpppR0.pdf` | No document number |

---

## Plans

**Format:** `Plans-[YYMMDD]-[Type].pdf`

| Example |
|---------|
| `Plans-251215-Civil.pdf` |
| `Plans-251215-SWPPP.pdf` |

---

## Permits

**Format:** `[PermitType]-[PermitNumber]-[YYMMDD].pdf`

| Type | Example |
|------|---------|
| NOI (Notice of Intent) | `NOI-AZC110437-250812.pdf` |
| NDC (Notice of Dust Control) | `NDC-113801-251208.pdf` |
| Dust Permit (issued) | `DustPermit-F051905-251217.pdf` |
| Dust Application | `DustApplication-D0062940-251208.pdf` |

---

## SWPPP Documents

**Format:** `[DocType]-[YYMMDD].pdf`

| Example |
|---------|
| `SWPPP-Plan-251215.pdf` |
| `Narrative-251218.pdf` |
| `SitePlan-251215.pdf` |

---

## Inspections

**Format:** `[YYMMDD].pdf` or `[YYMMDD]-[Modifier].pdf`

| Example | Description |
|---------|-------------|
| `250722.pdf` | Regular inspection |
| `250722-Rain.pdf` | Rain event inspection |
| `250722-Rain-Reg.pdf` | Combined rain + regular |

**Photos folder:** `Photos/YYMMDD/IMG_001.jpg`

---

## Invoices

**Format:** `Invoice-[InvoiceNumber]-[YYMMDD].pdf`

| Example |
|---------|
| `Invoice-IV086336-251208.pdf` |

---

## Change Orders

**Format:** `ChangeOrder-[##]-[YYMMDD]-[Services]R[#].pdf`

| Example |
|---------|
| `ChangeOrder-01-251215-swpppR0.pdf` |
| `ChangeOrder-02-251220-tfR0.pdf` |

---

## Lien Waivers

**Format:** `LienWaiver-[Progress|Final]-[YYMMDD].pdf`

| Example |
|---------|
| `LienWaiver-Progress-251220.pdf` |
| `LienWaiver-Final-251230.pdf` |

---

## Closeout

| Type | Example |
|------|---------|
| Final Inspection | `FinalInspection-251230.pdf` |
| Closeout Letter | `CloseoutLetter-251231.pdf` |
| NOT (Notice of Termination) | `NOT-251231.pdf` |

---

## Service Tags

| Tag | Service |
|-----|---------|
| `swppp` | SWPPP |
| `tf` | Temp Fence |
| `dc` | Dust Control |
| `pj` | Portable Toilets |
| `ss` | Street Sweeping |
| `wt` | Water Truck |
| `ro` | Roll-Off Dumpsters |

Combine with dashes: `-swppp-tf-dc`

---

## Rules

1. **Dates always YYMMDD** (6 digits, no dashes)
2. **Underscores for spaces** in names (`EOS_Builders`, `Helen_Drake_Village`)
3. **Dashes to separate fields** (`Estimate-09022502R0-EOS_Builders-swppp.pdf`)
4. **Lowercase service tags** (`-swppp-tf` not `-SWPPP-TF`)
5. **Always include revision** starting at `R0`
6. **No spaces in filenames**

---

## Project Folder Name

**Format:** `[Project Name] - [Contractor Name]`

| Example |
|---------|
| `Kiwanis Playground - Caliente Construction` |
| `PV Redevelopment Phase 5 - BPR Companies` |
| `Ak Chin Medical Suites - AR Mays Construction` |

Project name first (you usually remember project before contractor).

---

## Automatic Document Identification (Mistral)

The `identify_document` tool in `services/mistral` extracts metadata and can auto-rename files.

**Extracted fields:**

- `gc_company` - General contractor company name
- `project_name` - Project name
- `document_type` - contract, estimate, LOI, permit, invoice, insurance_cert, correspondence, other
- `document_number` - Any ID/number on the doc (PO, job number, contract number, etc.)
- `action_required` - If recipient must act
- `deadline` - Deadline in YYYY-MM-DD format

**Auto-rename format:**

```css
{document_type}_{project}_{gc}[_{document_number}].pdf
```

| Input | Output |
|-------|--------|
| `random-email-attachment.pdf` | `contract_Good-Day-Gilbert_NFC-LLC_1730001-001.pdf` |
| `scan001.pdf` | `LOI_Sprouts-Rita-Ranch_AR-Mays-Construction_251056-008.pdf` |

**Usage:**

```bash
# Via MCP
mcp__desert-mistral__identify_document file_path="/path/to/doc.pdf" rename=true

# Via CLI
mistral-mcp identify /path/to/doc.pdf --rename
```
