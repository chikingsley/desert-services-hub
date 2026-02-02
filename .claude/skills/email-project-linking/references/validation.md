# Email-Project Linking Validation

## Quick Validation Test

After linking emails to a project, run this validation:

```sql
-- Sample 10 random emails and check if they're relevant
SELECT subject, from_email, from_domain
FROM emails
WHERE project_id = ?
ORDER BY RANDOM()
LIMIT 10;
```

**Pass criteria**: All 10 emails should be clearly related to the project.

## Detailed Validation Queries

### 1. Check Subject Relevance

```sql
-- Count emails with project keywords in subject
SELECT 
  COUNT(*) as total,
  SUM(CASE 
    WHEN LOWER(subject) LIKE '%keyword1%' 
    OR LOWER(subject) LIKE '%keyword2%' 
    THEN 1 ELSE 0 
  END) as matching
FROM emails
WHERE project_id = ?;
```

If `matching / total < 0.5`, something is wrong.

### 2. Check Domain Distribution

```sql
-- See which domains are sending/receiving
SELECT from_domain, COUNT(*) as c
FROM emails
WHERE project_id = ?
GROUP BY from_domain
ORDER BY c DESC
LIMIT 10;
```

Expected: Contractor domain and desertservices.net should dominate.

### 3. Check for Obvious False Positives

```sql
-- Find emails that mention OTHER project names
SELECT id, subject
FROM emails
WHERE project_id = ?
AND (
  LOWER(subject) LIKE '%different project%'
  OR LOWER(subject) LIKE '%unrelated%'
)
LIMIT 5;
```

### 4. Compare to Folder Count

If you linked from a folder:

```sql
-- How many emails came from folder vs thread expansion?
-- Folder emails should be the "seed"
```

## Red Flags

1. **Too many emails** - A small project shouldn't have 1000+ emails
2. **Wrong domains** - Emails from contractors not on this project
3. **Unrelated subjects** - Subjects mentioning different projects
4. **Time range issues** - Emails from before the project started

## Fixing Bad Links

If validation fails:

```sql
-- Clear links for this project
UPDATE emails SET project_id = NULL WHERE project_id = ?;
```

Then re-link using stricter criteria:

1. Only folder emails (Tier 1)
2. Only same-conversation emails (Tier 2)
3. Skip domain linking if causing false positives

## Evaluation Test Cases

For testing the skill itself, use these projects:

| Project | Expected Emails | Key Indicators |
|---------|-----------------|----------------|
| Prasada Clubhouse | ~50 | "prasada", "elanto", Property Reserve |
| Moreland Phase 1 | ~100 | "moreland", EOS Builders |
| Anthem Commerce Park | ~150 | "anthem", "4121", Bjerk Builders |

Run the skill, then verify:

1. Email count is in expected range
2. Random sample shows relevant emails
3. Contractor domain appears in results
