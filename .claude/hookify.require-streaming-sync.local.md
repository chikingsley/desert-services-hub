---
name: require-streaming-sync
enabled: true
event: file
conditions:
  - field: new_text
    operator: regex_match
    pattern: (async\s+function|const\s+\w+\s*=\s*async).*\{[\s\S]*?(\.push\([^)]+\)[\s\S]*?){3,}[\s\S]*?(for\s*\(|\.forEach|\.map)
---

⚠️ **Batch-then-Store Pattern Detected**

You're writing code that appears to accumulate data into an array before processing/storing it. This pattern causes:

- **Memory issues**: Large datasets exhaust memory before any data is persisted
- **No durability**: If the process crashes mid-way, ALL progress is lost
- **No visibility**: User has no idea what's happening during long fetches

**The Problem (from sync.ts):**

```typescript
// BAD: Fetches ALL emails into memory, then stores
const emails = await client.getAllEmailsPaginated(mailbox, since, max);
for (const email of emails) {
  insertEmail(email);  // Only starts storing AFTER full fetch
}
```

**The Solution - Stream and Store:**

```typescript
// GOOD: Fetch page → store immediately → repeat
let nextLink: string | undefined;
let stored = 0;

do {
  const page = await client.getEmailPage(mailbox, since, nextLink);

  for (const email of page.emails) {
    insertEmail(email);
    stored++;
    onProgress?.({ stored, phase: 'storing' });
  }

  nextLink = page.nextLink;
} while (nextLink);
```

**Requirements for sync/batch operations:**

1. **Stream**: Process data as it arrives, don't accumulate first
2. **Persist immediately**: Store each item/page before fetching more
3. **Track progress**: Report counts so users see activity
4. **Resume support**: Store cursor/offset to resume after crashes

**Progress tracking options:**

- Simple callback: `onProgress({ processed, total, phase })`
- CLI progress bars: `cli-progress`, `ora`, or built-in logging
- Checkpoint files: Save last processed ID/cursor to disk
