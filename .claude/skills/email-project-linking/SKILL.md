---
name: email-project-linking
description: Links emails to projects using folder ground truth, contractor domains, and conversation threading. Use when asked to "link emails to projects", "find all emails for a project", "associate emails", "match folder emails", or "connect emails to estimates".
---

# Email-Project Linking

Link emails to projects accurately using a three-tier approach.

## When to Use

- User asks to link emails to a project
- User wants to find all emails for a project/estimate
- User asks to match Outlook folder emails to database
- User needs to verify email-project associations

## The Three-Tier Approach

### Tier 1: Folder Ground Truth (Highest Accuracy)

Chi's Outlook folders are manually curated. Use these as the definitive source:

```bash
# Get folder emails from Outlook, match to DB by internet_message_id
bun .claude/skills/email-project-linking/scripts/link-folder-emails.ts "Elanto at Prasada"
```

This links emails directly by RFC 2822 message ID - 100% accuracy.

### Tier 2: Conversation Thread Expansion

Once folder emails are linked, expand via conversation threads:

```bash
# Expand to all emails in same conversations
bun .claude/skills/email-project-linking/scripts/expand-threads.ts --project-id=287
```

If email A is in a folder → linked to project. All emails with same `conversation_id` → also linked.

### Tier 3: Contractor Domain Matching

For emails not in folders or conversations, match by contractor domain:

```bash
# Find and link emails from/to contractor domain
bun .claude/skills/email-project-linking/scripts/link-by-domain.ts --project-id=287 --domain=bprcompanies.com
```

## Workflow

1. **Find the project** in database:

   ```sql
   SELECT id, name FROM projects WHERE name LIKE '%search%';
   ```

2. **Find aliases** (folder names that map to this project):

   ```sql
   SELECT alias FROM project_aliases WHERE project_id = ?;
   ```

3. **Get contractor domain**:

   ```sql
   SELECT e.contractor, a.domain
   FROM estimates e
   LEFT JOIN accounts a ON LOWER(a.name) LIKE '%' || LOWER(SUBSTR(e.contractor, 1, 8)) || '%'
   WHERE e.project_id = ?;
   ```

4. **Link folder emails** (Tier 1) - run `link-folder-emails.ts`

5. **Expand threads** (Tier 2) - run `expand-threads.ts`

6. **Link by domain** (Tier 3) - run `link-by-domain.ts`

7. **Verify results**:

   ```sql
   SELECT COUNT(*) as total,
     SUM(CASE WHEN project_id = ? THEN 1 ELSE 0 END) as linked
   FROM emails
   WHERE subject LIKE '%project name%';
   ```

## DO NOT

- Text-search project names against email content (massive false positives)
- Use generic project names like "Good 2 Go", "Project N" for text matching
- Link without verifying contractor matches
- Skip the verification step

## Adding Aliases

When a folder name doesn't match the estimate name:

```sql
INSERT INTO project_aliases (project_id, alias, normalized_alias, source)
VALUES (
  287,
  'Elanto at Prasada',
  'elanto at prasada',
  'outlook_folder'
);
```

## Verification Test

After linking, sample emails should all be relevant:

```sql
SELECT subject, from_email 
FROM emails 
WHERE project_id = ? 
ORDER BY RANDOM() 
LIMIT 10;
```

If any email looks unrelated, the linking is wrong. Clear and retry with stricter matching.

## References

- [patterns.md](references/patterns.md) - Common matching patterns and edge cases
- [validation.md](references/validation.md) - How to verify linking quality
