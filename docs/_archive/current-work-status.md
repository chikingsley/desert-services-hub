# Current Work Status

## What We've Done

### 1. Inspection Reports Audit

* *Source:** Monday.com board `8791849123` (1,409 items)

* *Findings:**

- 99.6% well-populated records
- Fixed wrong board ID in `services/monday/types.ts`
- Added `getItemsRich()` function to properly query mirror/linked columns
- Exported to `tempfiles/inspection_reports_audit.csv`

* *Data Quality Issues:**

- 600 items have inconsistent date prefixes in names
- 15 duplicate entries
- Superintendent field has name/phone/email conflicts

- --

### 2. Competitors Database (from "Other" provider fields)

* *Status:** Cleaned, needs final verification

* *Raw data:** 178 entries from inspection reports
* *After cleanup:** ~62 real competitors

* *Files:**

- `docs/abbreviations_to_verify.md` - Abbreviations to verify
- `tempfiles/competitors_clean.json` - Clean competitor list
- `tempfiles/competitors_raw.json` - Raw extracted data

* *Resolved Abbreviations:**

| Abbrev | Company |
|--------|---------|
| WM | Waste Management |
| LP | LP Rent-A-Fence |
| DX | Dumpstr Xpress |
| MGM | MGM Sweeping LLC |
| UWS | Universal Waste Systems |
| etc. | (see abbreviations_to_verify.md) |

* *Still Unknown:** HBS, 310 Onsite

- --

### 3. Monday Service (Code Improvements)

* *File:** `services/monday/client.ts`

- Added `getItemsRich()` for proper mirror/board_relation column data
- Fixed GraphQL fragments for linked items

- --

## What We Have (Data Assets)

| Data | Location | Records |
|------|----------|---------|
| Inspection Reports | Monday board 8791849123 | 1,409 |
| Estimating/Projects | Monday board 7943937851 | ? |
| Contractors | Monday board 7943937856 | ? |
| Dust Permits | Monday board 9850624269 | ? |
| SWPPP Plans | Monday board 9778304069 | ? |
| Competitors (cleaned) | tempfiles/competitors_clean.json | 62 |

- --

## Dust Control Application Form

* *Location:** `/auto-dust-permit-application/docs/permit-process/dust-control-application-questions.md`

* *What it covers:**

- A. Applicant Information (company, owner, contacts)
- B. Project Information (name, dates, bulk materials)
- C. Dust Control Plan (wind, vehicles, surface stabilization, bulk materials, trackout, grading, utilities, demolition, weed abatement, blasting)
- K. Technical Data (soil, water sources, water application methods)

### Potential Improvements Based on Data

1. **Pre-fill from Inspection Reports:**

    - Water truck provider patterns
    - Common control measures used
    - Typical water source configurations

2. **Validation from Competitor Data:**

    - Auto-suggest known providers
    - Flag unknown abbreviations
    - Standardize naming

3. **Smart Defaults:**

    - Based on project type/size
    - Based on location (Maricopa County patterns)
    - Based on contractor history

- --

## Next Steps

- [ ] Verify abbreviations (docs/abbreviations_to_verify.md)
- [ ] Decide: Push competitors to Notion? (after proper filtering)
- [ ] Connect inspection report data to dust permit form
- [ ] Analyze what fields are commonly filled vs left blank
- [ ] Build better validation/suggestions for the form

- --

## Related Repos

| Repo | Purpose |
|------|---------|
| n8n-stuff | Services, scripts, data processing |
| auto-dust-permit-application | Dust permit form automation |
