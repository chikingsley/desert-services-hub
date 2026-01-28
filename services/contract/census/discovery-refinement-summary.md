# Discovery Engine Refinement Summary

## Sprouts Rita Ranch Analysis

### Email Breakdown (After Refinement)

**Total Emails Found: 231** (down from 500+)

1. **Directly Linked** (project_id = 14): **125 emails**
   - These are emails that are already linked to the project in the database
   - Highest confidence (100%)

2. **Found by Project Code Matching**: **~23 emails**
   - Emails with project code "251056" but `project_id IS NULL`
   - High confidence (90%)

3. **Found by Project Name Phrase Matching**: **~83 emails**
   - Emails with phrase "Rita Ranch Sprouts" or "Sprouts Rita Ranch" in subject
   - Includes emails like "Rita Ranch Sprouts - SWPPP Design"
   - Moderate confidence (85%)

### Why So Many?

The discovery engine is finding **legitimate emails** that aren't linked in the database:

- **125 emails** are directly linked (project_id = 14)
- **~23 emails** have project code "251056" but aren't linked
- **~83 emails** have the project name phrase but aren't linked
- **118 emails** with project name phrase ARE already linked (overlap with the 125)

These are all legitimate Sprouts Rita Ranch project emails - many just aren't properly linked in the database yet.

### Refinements Made

1. ✅ **Removed keyword matching** when project is found (was adding 192 false positives)
2. ✅ **Exclude emails linked to different projects** (removed 11 false positives)
3. ✅ **Prioritize project code matches** (always include if code found)
4. ✅ **Require phrase matching** for project name (e.g., "Rita Ranch Sprouts" together)
5. ✅ **Date filtering** (180 days) for project name matches
6. ✅ **Deduplication by message_id** (removes duplicates across mailboxes)
7. ✅ **Stricter subject matching** (prefer phrase matches over individual word matches)

### Current Results

- **Thread:** 1 email (seed email only - no thread)
- **Project:** 230 emails
  - 125 directly linked (project_id = 14)
  - ~23 with project code "251056"
  - ~82 with project name phrase in subject

### Match Modes Available

The discovery engine now supports three match modes:

- **`strict`**: Only project code matches + exact phrase matches
- **`moderate`** (default): Project code + phrase + all words in subject
- **`loose`**: Includes partial word matches (2+ words)

### Code Changes

The discovery engine now:

- Uses phrase matching for project names (more precise)
- Prioritizes project code matches (always included)
- Filters out emails linked to different projects
- Applies date filtering for name matches (180 days)
- Deduplicates by message_id
- Supports configurable match strictness

### Usage Example

```typescript
// Strict mode - only high confidence matches
const strict = await discoveryEngine.discover(emailId, {
  projectMatchMode: 'strict',
  maxResults: 200,
});

// Moderate mode (default) - balanced
const moderate = await discoveryEngine.discover(emailId, {
  projectMatchMode: 'moderate',
  maxResults: 500,
});
```

---

*Analysis Date: January 27, 2026*
*Refined from 500+ emails to 231 emails*
