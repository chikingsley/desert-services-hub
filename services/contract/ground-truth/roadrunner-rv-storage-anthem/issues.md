# Issues: Roadrunner RV Storage - Anthem

## CRITICAL: Duplicate/Incorrect Monday Entries

### The Problem

There are TWO estimates in Monday for what is the SAME project:

1. **Estimate 3532 - "ANTHEM BOAT & RV STORAGE"**
   - Contractor: TLW Construction
   - Status: **Won**
   - Bid Value: $19,650.00
   - Awarded Value: $19,650.00
   - This is CORRECT

2. **Estimate 3405 - "ROADRUNNER RV STORAGE -ANTHEM"**
   - Contractor: TLW Construction
   - Status: **Yet to Bid** (WRONG!)
   - Bid Value: $3,423.75
   - Created: January 19, 2026 (per Monday notification email 156621)
   - This is INCORRECT/DUPLICATE

### Evidence

- The project was WON in June 2025 and has been actively billing since then
- Invoice SW25-174-01 issued July 2025
- June draw payment of $3,575.00 received July 18, 2025
- Invoice SW25-174-02 issued January 28, 2026 for $925
- Procore billing invites received in December 2025
- Unconditional lien waivers signed

### Required Action

- [ ] Mark estimate 3405 "ROADRUNNER RV STORAGE -ANTHEM" as duplicate or delete
- [ ] Verify estimate 3532 "ANTHEM BOAT & RV STORAGE" has correct awarded value
- [ ] Ensure project name consistency across systems

---

## Data Quality: Name Inconsistency

### The Problem

The project is referred to by at least 4 different names:
- "ROADRUNNER RV STORAGE -ANTHEM" (Monday duplicate)
- "ANTHEM BOAT & RV STORAGE" (Monday original)
- "Roadrunner RV Storage- Anthem" (Kendra's standardized name)
- "Roadrunner RV" / "Anthem RV Storage" (informal in emails)

### Impact

- Search queries may miss relevant emails
- Linking estimates to projects is unreliable
- Confusion when processing billing/contracts

### Recommendation

Standardize on: **"Roadrunner RV Storage - Anthem"** (per Kendra's June 13, 2025 email)

---

## Historical Estimate: Older Entry Exists

### The Problem

There's also Estimate 2054 "ANTHEM BOAT & RV STORAGE" with:
- Contractor: TLW Construction
- Status: Bid Sent
- Bid Value: $16,000.00

This appears to be an earlier revision before the final $19,650 bid was submitted and won.

### Impact

Three estimates exist for one project, creating confusion about actual contract value and status.

---

## Missing: Project Record Linking

The `projects` table has an entry for "Roadrunner Rv Storage -anthem" (id unknown) but it shows:
- email_count: 0
- monday_item_id: NULL
- account_id: NULL

This means the project record isn't linked to the 50+ emails that exist for this project.

### Required Action

- [ ] Link project to correct Monday item (3532)
- [ ] Run email linking to associate emails with project
- [ ] Link to TLW Construction account record
