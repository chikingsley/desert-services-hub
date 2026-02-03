---
name: email-project-linking
description: Links emails to projects and estimates. Use when asked to "link emails", "find emails for estimate", "show estimate history", "associate emails", or "connect emails to projects/estimates".
---

# Email-Project Linking

Link emails to projects and estimates. Two systems exist:

1. **Project-level**: `emails.project_id` - links emails to projects (folder-based)
2. **Estimate-level**: `estimate_emails` table - pre-computed links to estimates (automated sync)

## Quick Start: Find Emails for an Estimate

```sql
-- Check if estimate has pre-computed emails
SELECT e.subject, e.from_email, e.received_at, ee.match_type
FROM estimate_emails ee
JOIN emails e ON e.id = ee.email_id
WHERE ee.estimate_id = (SELECT id FROM estimates WHERE estimate_number = 'EST-12345')
ORDER BY e.received_at DESC;
```

If empty, run manual research (see "Manual Linking" below).

## Current Coverage (as of Feb 2026)

| Source | Coverage |
|--------|----------|
| Building Connected | 70% |
| PlanHub | 39% |
| Email/Direct/Same Day | 25-30% |

Total: 1,236 of 4,781 estimates have pre-computed email links.

## Re-running the Sync

To refresh all estimate-email links:

```bash
cd services/contract/census
bun sync/estimate-emails.ts
```

This takes ~1 minute and:

- Matches platform emails by contractor + name tokens
- Matches direct emails by contractor domain + name tokens  
- Expands via conversation threads

## Manual Linking (for gaps)

When automated sync misses an estimate, manually link:

```typescript
import { linkEmailToEstimate, findEstimate, findEmail } from "./db/repositories/estimate-email"

// Find the estimate
const estimate = findEstimate("EST-12345") // by estimate_number
// Or: findEstimate(138) // by id

// Find relevant emails
const emails = db.query(`
  SELECT id, subject FROM emails 
  WHERE subject LIKE '%project name%'
`).all()

// Link them
for (const email of emails) {
  linkEmailToEstimate(estimate.id, email.id, "manual", "agent research")
}
```

## When to Use Each Approach

| Situation | Action |
|-----------|--------|
| User asks for estimate email history | Query `estimate_emails` first |
| `estimate_emails` is empty | Run manual research, then link |
| Need to refresh all links | Run `sync/estimate-emails.ts` |
| Linking folder emails to project | Use Tier 1-3 approach below |

---

# Project-Level Linking (Tier Approach)

For linking emails directly to projects (not estimates):

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

---

# Repository API (estimate-email.ts)

Location: `services/contract/census/db/repositories/estimate-email.ts`

```typescript
// Link an email to an estimate
linkEmailToEstimate(estimateId: number, emailId: number, matchType: string, matchDetail: string)

// Remove a link
unlinkEmailFromEstimate(estimateId: number, emailId: number)

// Get all emails for an estimate
getEstimateEmails(estimateId: number): Email[]

// Get all estimates for an email
getEmailEstimates(emailId: number): Estimate[]

// Find estimate by ID or estimate_number
findEstimate(idOrNumber: number | string): Estimate | null

// Find email by ID or internet_message_id
findEmail(idOrMessageId: number | string): Email | null
```

## Database Schema

```sql
-- estimate_emails table (many-to-many)
CREATE TABLE estimate_emails (
  id INTEGER PRIMARY KEY,
  estimate_id INTEGER NOT NULL,
  email_id INTEGER NOT NULL,
  match_type TEXT NOT NULL,  -- 'contractor', 'direct', 'thread', 'manual'
  match_detail TEXT,         -- e.g., 'token:millennium', 'domain:chasse.com'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(estimate_id, email_id)
);
```
