# Dust Permit Email Notifications — Design

## Problem

Dust permit email notifications (issued, renewed, billing, reminders, etc.) are not hooked up. The 8 HBS templates in `packages/archive/email/` are dead code. `permit-email-jobs.ts` only parses inbound emails and updates the DB — no outbound notifications are sent.

## Solution

Replace the dead HBS templates with TypeScript template functions and create a Trigger.dev `schemaTask` for on-demand permit notifications.

## Architecture

### File 1: `lib/email/permit-templates.ts`

Pure TypeScript email template functions. Each returns `{ subject: string; body: string }`.

**Template types:**
- `issued` — permit issued by Maricopa (customer-facing)
- `renewed` — permit renewed (customer-facing)
- `submitted` — application submitted (customer-facing)
- `revised` — permit revised (customer-facing)
- `reminder` — expiration reminder (customer-facing)
- `billing` — internal billing notification (new permit)
- `billing-renewed` — internal billing for renewal
- `billing-revised` — internal billing for revision

**Template structure:**
- Shared `signature()` helper for Chi's email signature + logo
- Shared `detailsList()` helper for `<ul>` bullet lists
- Each template is a named export function: `permitIssuedEmail(vars)`, etc.
- Input types are per-template interfaces with only the vars that template needs
- Output: `{ subject: string; body: string }` (body is HTML)

### File 2: `apps/trigger-dev/src/trigger/permit-notifications.ts`

A `schemaTask` with schema:
```ts
{
  permitId: string,          // D0XXXXXX
  type: NotificationType,    // one of the 8 types
  recipients?: string[],     // override recipients (default: from permit/account)
  draft?: boolean,           // true = create draft, false = send immediately (default: true)
  extraVars?: Record<string, string>,  // override/supplement template vars (e.g. billing fields)
}
```

**Flow:**
1. Look up permit from `dust_permits_filed_by_desert_services` via Bun.sql
2. Build template vars from permit data + any extraVars overrides
3. Call the template function for the notification type
4. If `draft: true` (default): create Outlook draft via `createComposeClient().createDraft()`
5. If `draft: false`: create draft then immediately send via `sendDraft()`
6. Return `{ draftId, subject, sentOrDrafted: "draft" | "sent" }`

**Email sending:** Uses `lib/graph/client.ts` `createComposeClient()` which already handles Graph API auth (client credentials) and supports chi@, contracts@, dustpermits@ mailboxes.

### Trigger Integration

- On-demand via API: `POST /api/v1/tasks/permit-notification/trigger`
- From CLI: `bunx trigger.dev@latest tasks trigger permit-notification --payload '...'`
- Chainable: Other tasks (like `permit-sync`) can trigger notifications when permit status changes

## Data Flow

```javascript
Trigger (API/CLI/chained) → permit-notifications task
  → Postgres lookup (permit data)
  → Template function (TypeScript string interpolation)
  → Graph API createDraft() → Outlook draft in chi@ mailbox
  → (optional) sendDraft() → email sent
```

## Decisions

- **No Handlebars dependency** — template literals + helper functions are simpler and type-safe
- **Draft by default** — safety net so Chi can review before sending
- **Configurable send mode** — `draft: boolean` param, defaults to true
- **All 8 types at once** — they share 90% structure, minimal incremental effort
- **extraVars for billing** — billing templates need fields not in the permit record (invoice, payment method, etc.), so these are passed as overrides
