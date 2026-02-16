---
name: dust-permit-billing
description: Send internal billing notification after dust permit payment. Use when asked about dust permit billing, notifying the billing team, or processing permit payment confirmations.
---

# Dust Permit Billing (Internal Workflow)

Send internal billing notification to billing team after a dust permit is submitted and paid. NOT customer-facing.

## Recipients

- **TO:** <eva@desertservices.net>, <jayson@desertservices.net>
- **CC:** <don@desertservices.net>, <francine@desertservices.net>, <kendra@desertservices.net>

## Subject Format

`Dust Permit Billing - {PROJECT NAME}` (no contractor name)

## Data Sources

1. **Point and Pay confirmation email** — Payment date, confirmation ID, card last 4, cardholder, permit cost
2. **Permit application/issued email** — Application #, Facility ID, site address, acreage
3. **Monday ESTIMATING board** — Schedule value (from awarded estimate)
4. **Notion Dust Permits** — Project details, accelerated processing status

## Schedule Values

- Standard dust permit: $5,000
- Accelerated processing fee: $500 (when applicable)
- Revision/renewal: $2,500

## HTML Formatting Rules

See [`.claude/skills/draft-email/html-reference.md`](../draft-email/html-reference.md) for full reference.

- Use `<b>` not `<strong>`
- Use `<ul>/<ol>` with `style="margin-top:0; margin-bottom:0;"`
- Do NOT add `<div><br></div>` before/after lists
- Do NOT use `<p>` tags
- Signature is added by Outlook — use `skipSignature: true`

Correct list pattern:
```html
<div>Intro text.</div>
<ul style="margin-top:0; margin-bottom:0;">
<li><div><b>Label:</b> Value</div></li>
</ul>
<div>Closing text.</div>
```

## Template

`apps/cli-tools/email-cli/src/email-templates/dust-permit-billing.hbs`

Variables: `recipientName`, `accountName`, `projectName`, `address`, `applicationNumber`, `permitNumber`, `acceleratedProcessing`, `vendorName`, `permitCost`, `acceleratedFee`, `scheduleValue`, `paymentMethod`, `paymentDate`, `confirmationId`, `cardLastFour`, `cardholderName`, `invoiceNumber`, `invoiceDate`

## Workflow

1. Find Point and Pay confirmation in chi@ inbox
2. Extract: payment date, confirmation #, card last 4, cardholder, amount
3. Find permit application/issued email for project details
4. Look up schedule value in Monday (awarded estimate value)
5. Create draft using template
6. Review in Outlook, then send
