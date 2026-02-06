# Estimate Linker Agent Memory

## Batch Linking Run - February 5, 2026

### Final Results: 87 of 92 linked (94.6%)

- **Agent auto-linked**: 72 projects (Haiku agent, first pass)
- **Manual research linked**: 15 projects (Opus, email/estimate deep search)
- **Truly unlinked**: 5 projects (no estimate exists in Monday)

---

## Manual Research Findings (15 projects)

### Won Estimates - Direct Match (6)
- ID 1: Pacific Tek -> PACIFIC TEK by Ganem Companies (9646558866) -- had dummy ["123","456"]
- ID 21: DCS University Drive -> DCS UNIVERSITY DRIVE + TF variant by ITDG
- ID 39: Houghton Road -> Houghton Road Industrial Center (TUCSON PROJECT) by Metals Treatment Technologies
- ID 49: Lexington 420 -> SLC LEXINGTON 420 BUILDING D (SLC = Stevens-Leinweber Construction initials)
- ID 52: Mead & Hunt -> MAB - Mead & Hunt by SYMBION ENGINEERING + MAB JOB by Mead & Hunt direct
- ID 86: Zaxbys -> TF: ZAXBY'S by 41 North (only Won variant, base was GC Not Awarded)

### Won Estimates - Contractor Mismatch Resolved (3)
- ID 17: Cavasson -> CAVASSON MOB & RETAIL NORTH (18077239001) Won by BPR Companies
  - Project says Layton, but Layton's bid was "GC Not Awarded" (same $17,717.50 value)
  - BPR won the GC contract; 3 GCs bid same scope
- ID 18: CFA #5729 -> CFA 5729 + TF + PJ by BCCM Construction Group
  - Project says On-Site Builders (bid invite source), estimate says BCCM
  - Email from theosbi.com (On-Site Builders Inc) confirms same project
- ID 90: P99 City of Avondale -> WDP KITCHELL 99TH AVE (9785372870) Won by Nitti Builders
  - "P99" = internal code for 99th Ave project, "WDP" = developer, Kitchell = CM

### Bid Sent Estimates - Project Active, Monday Needs Update (6)
- ID 16: Casa Grande -> ALA CASA GRANDE by Way Construction (10802867490, Bid Sent)
- ID 41: I-10 and Wendler -> PINE CREEK I-10 by Stevens-Leinweber (10781384597, Bid Sent)
  - Full name: "Pine Creek I-10 Wendler Industrial" from BuildingConnected
  - DS actively doing NOI and dust permits (Dec 2025 emails)
- ID 42: IndiCap-Bethany Bay -> BETHANY BAY by FCL Builders (18238735996, Bid Sent)
  - DS doing dust permits and SWPPP (Oct 2025 emails)
- ID 62: PVUSD Indian Bend -> INDIAN BEND ES REBUILD by Chasse (4 estimate variants, all Bid Sent)
  - Agent incorrectly rejected because it found MUSD (different district)
  - Actual matching estimates: 10639198992, 10782560755, 10910247540, 10631265601
- ID 64: Schwab Beverly Lane -> SCHWAB BEVERLY LANE by Gilbane (10993310572, Bid Sent)
  - Project says "Copper State Pavement" but GC is actually Gilbane
  - DS doing SWPPP (Jan 2026 emails from GilbaneCo.com)
- ID 67: Southern Grand Townhomes -> Southern Grand townhomes (10759544369, New)
- ID 71: Standard Restaurant -> STANDARD RESTAURANT SUPPLY by Pro Steel (10802833801, Bid Sent)

---

## Truly Unlinked (5 projects - No Estimate Exists)

- ID 6: 4121 W Innovative Dr TI (Bjerk) -- project from Oct 2025, no estimate in Monday
- ID 45: Jeff & Aileen Rich (Diamond Custom Homes) -- residential, no estimate system entry
- ID 50: LG Project in Queen Creek (Hoffman Construction) -- zero Hoffman estimates
- ID 80: TLW 44026 N. Black Canyon Hwy -- no matching TLW estimate name
- ID 88: Juniper Square (Weis) -- 2024 project, predates current estimating system

---

## Agent Failure Analysis

### Why Haiku Missed These (Improvement Areas)

1. **Won-only filter too strict**: 6 projects had matching estimates at "Bid Sent" status. Agent should also search non-Won when the project is clearly active.

2. **Contractor name in project.db can be wrong**: Projects 17, 18, 64 had wrong contractor names. Agent should search by project name keywords across ALL contractors, not just the one listed.

3. **Abbreviation expansion**: MT2 = Metals Treatment Technologies, SLC = Stevens-Leinweber Construction. Agent should try expanding abbreviations and also search initials.

4. **Estimate name completely different from project name**: "I-10 and Wendler" = "PINE CREEK I-10" (email research needed), "P99 City of Avondale" = "WDP KITCHELL 99TH AVE".

5. **Same project bid to multiple GCs**: Cavasson bid to Layton, Jokake, BPR -- different GCs, same bid value. The GC that won may differ from the one in projects.db.

6. **Company name variations not handled**: Symbiote/SYMBION, Ganem Construction/Ganem Companies, OSBI/BCCM.

### Recommended Agent Improvements

- Search ALL bid statuses (not just Won) when initial Won search fails
- Search by project name keywords across ALL contractors as fallback
- Try abbreviation expansions (MT2 -> Metals, SLC -> Stevens-Leinweber)
- When contractor not found, search by contractor email domain in accounts table
- Check for same bid_value across different contractors (signals multi-GC bid)

---

## Key Lessons

- **IDM Companies = FORM GC / IDM Builds** (contractor name variation)
- **EDGECORE = EDGECOR** (spelling variation)
- **Symbiote = SYMBION ENGINEERING** (company name variation)
- **Ganem Construction = Ganem Companies** (corporate rename)
- **On-Site Builders Inc = BCCM** (related companies or data entry)
- **MT2 = Metals Treatment Technologies** (abbreviation)
- **SLC = Stevens-Leinweber Construction** (initials as prefix)
- **P99 = project code for 99th Ave** (internal numbering)
- **WDP = developer prefix** (Wood Partners?)
- Multiple estimate variants are common: TF, PJ, base, REBID
  - Link all variants in `linked_estimate_ids` array
  - Use base/non-prefixed as `monday_item_id`
  - If only prefixed exists, use that as primary
