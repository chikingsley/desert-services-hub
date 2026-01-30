# Email-to-Project Linking Audit

**Date:** 2026-01-29  
**Total Emails:** 223,646  
**Linked Emails:** 14,336 (6.4%)  
**Projects with Linked Emails:** 101

## Current Implementation

**Script:** `link-emails-to-projects.ts`

**Method:** SQL-based bulk updates using `LIKE` pattern matching

- **Does NOT use** the sophisticated linking functions from `linking.ts`
- Uses simple SQL: `LOWER(subject) LIKE '%project_name%'` and `LOWER(body_preview) LIKE '%project_name%'`
- Processes projects one-by-one (longer names first)
- Single transaction for all updates
- Progress bar shows project count, not email-level details

## Match Quality Analysis

### Match Types Found

- **Subject matches:** 5,170 emails (36%)
- **Body preview matches:** 420 emails (3%)
- **Body full matches:** 579 emails (4%)
- **"Other" matches:** 8,167 emails (57%) - These don't match project name in subject/body_preview/body_full

### "Other" Matches Investigation

The 8,167 "other" matches likely come from:

1. **Conversation thread propagation** - Emails linked because siblings in the same conversation were linked
   - Example: Email with subject "RE: 25404 Desert Services PSA" linked to "Bethany Bay" because other emails in the thread have "25404 Bethany Bay" in subject
2. **Project aliases/normalized names** - Matching via project aliases table
3. **Manual linking** - Linked via API or other processes
4. **Project code matching** - "25404" might be a project code that maps to "Bethany Bay"

### Sample Matches (Verified Correct)

- ✅ "FW: 25404 Bethany Bay - SWPPP" → "Bethany Bay" ✓
- ✅ "RE: 25404 Bethany Bay - SWPPP" → "Bethany Bay" ✓
- ✅ "Your Maricopa Air Quality payment" → "Bethany Bay" (matched via body containing "Bethany Bay")

### Potential Issues

1. **Catch-all Projects:**
   - `_Bids & RFPs` - 3,627 emails (likely too broad)
   - `_Admin & Operations` - 2,160 emails (likely too broad)
   - These seem like manual categorization, not real project matches

2. **False Positives Possible:**
   - Simple `LIKE '%name%'` can match partial words
   - Example: "Bethany" might match "Bethany Bay" correctly, but could also match unrelated text containing "bethany"
   - No word boundary checking in current SQL approach

3. **Missing Matches:**
   - Only 6.4% linked - vast majority still unlinked
   - Script doesn't use conversation thread linking (available in `linking.ts`)
   - Script doesn't use sender history matching (available in `linking.ts`)
   - Script doesn't use word-boundary regex matching (available in `linking.ts`)

## Recommendations

### Short Term (Understanding Current State)

1. ✅ **DONE** - Audit existing matches - most look correct
2. Investigate the "other" matches to understand how they were linked
3. Review catch-all projects (`_Bids & RFPs`, `_Admin & Operations`) - are these intentional?

### Medium Term (Improvements)

1. **Add visibility** - Show which emails are being matched in real-time
2. **Use existing linking functions** - Leverage `linking.ts` functions instead of raw SQL
3. **Add conversation thread linking** - Link emails in same conversation automatically
4. **Add sender history matching** - If sender usually emails about a project, link their emails
5. **Better matching** - Use word-boundary regex instead of simple LIKE

### Long Term (Optimization)

1. Process emails instead of projects (easier to track progress)
2. Batch processing with intermediate commits (better visibility)
3. Dry-run mode to preview matches before committing
4. Confidence scoring and signal tracking

## Key Finding

**The current script does NOT use the sophisticated linking functions** from `db/repositories/linking.ts`. It uses simple SQL LIKE patterns. The linking.ts functions provide:

- Word-boundary matching
- Conversation thread linking
- Sender history matching
- Signal tracking with confidence scores

These could significantly improve match quality and coverage.
