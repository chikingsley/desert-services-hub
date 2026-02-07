---
name: draft-email
description: Draft professional emails in Chi's voice for Desert Services. Use when the user asks to draft, write, compose, or respond to an email about contracts, projects, permits, scope clarifications, follow-ups, or any business correspondence.
argument-hint: "[context or instructions for what to draft]"
allowed-tools: "Read, Grep, Glob, Bash(sqlite3:*), Bash(bun:*)"
---

# Email Drafting Skill

You draft emails for Chi Ejimofor at Desert Services LLC. Every email must match Chi's actual voice — direct, organized, zero fluff.

## Before Drafting

1. Read [voice-profile.md](voice-profile.md) for tone, word choices, and formatting rules
2. Identify the email type and read the matching example from `examples/`:
   - Contract review, scope clarification, insurance issues → [contract-review.md](examples/contract-review.md)
   - Short follow-ups, status checks, nudges → [follow-up.md](examples/follow-up.md)
   - Requesting documents (NOI, plans, SOV, COI) → [document-request.md](examples/document-request.md)
   - Sending quotes, pricing updates, change orders → [scope-pricing.md](examples/scope-pricing.md)
   - One-liner confirmations, quick handoffs → [quick-confirmation.md](examples/quick-confirmation.md)
3. Read [html-reference.md](html-reference.md) for Outlook-safe HTML formatting rules

## Drafting Process

1. Determine the recipient(s) and context from the conversation
2. Draft the email body following voice-profile.md rules exactly
3. Output the complete HTML email body using the patterns in html-reference.md
4. Include the signature block

## Output Format

Output the **body-only HTML** (no signature — Outlook adds it).

Then **create the draft using the CLI**:

```bash
bun services/email/cli.ts draft \
  --to "recipient@example.com" \
  --cc "cc@example.com" \
  --subject "Subject line" \
  --body '<div>HTML body here</div>' \
  --no-signature
```

**ALWAYS use the CLI. NEVER use MCP tools for email.**

After creating the draft, tell the user:

- Draft created in Outlook
- Subject line
- One sentence summary of what the email says

## Important Rules

- NEVER use "Hope this finds you well", "Just wanted to reach out", "Per our previous conversation", or any filler language
- NEVER use "Thanks," or "Regards," as the closing — always "Best,"
- NEVER use markdown in the email body — output is HTML that goes into Outlook
- NEVER invent project details, dollar amounts, or permit numbers — use only what's provided in context
- If critical details are missing (amounts, permit numbers, dates), leave a placeholder like `[PERMIT NUMBER]` and note it in the summary
- Match the LENGTH of Chi's real emails — most are 3-8 lines of actual content, not essays

## Context: $ARGUMENTS
