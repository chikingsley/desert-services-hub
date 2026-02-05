# Dust Permit Email Templates

## Email Flow

| Step | Customer Template | Billing Template | Trigger |
|------|-------------------|------------------|---------|
| 1 | `dust-permit-submitted` | `dust-permit-billing` | Permit submitted to county |
| 2 | `dust-permit-issued` | - | Permit approved |
| 3 | `dust-permit-revised` | `dust-permit-billing-revised` | Revision submitted/approved |
| 4 | `dust-permit-reminder` | - | 2-4 weeks before expiration |
| 5 | `dust-permit-renewed` | `dust-permit-billing-renewed` | Renewal submitted/approved |
| 6 | `dust-permit-issued` (closeout) | - | Closeout confirmed |

## Templates by Audience

### Customer Templates (External)

Sent to project contacts and stakeholders.

| Template | Purpose |
|----------|---------|
| `dust-permit-submitted` | Notification when permit submitted (5-10 business days) |
| `dust-permit-issued` | Approval/Closeout confirmation |
| `dust-permit-revised` | Revision confirmation (includes Changes Made) |
| `dust-permit-renewed` | Renewal confirmation (includes superseded app) |
| `dust-permit-reminder` | Renewal reminder before expiration |

**Recipients:**

- Primary project contact
- Additional contacts (from Notion field)

### Billing Templates (Internal Only)

Sent to internal billing team for QuickBooks tracking.

| Template | Purpose |
|----------|---------|
| `dust-permit-billing` | Billing notification for new permit (costs, invoice) |
| `dust-permit-billing-revised` | Billing notification for revision (costs, changes) |
| `dust-permit-billing-renewed` | Billing notification for renewal (costs, invoice) |

**Recipients (Internal Billing Team):**

- <don@desertservices.net>
- <francine@desertservices.net>
- <kendra@desertservices.net>
- <eva@desertservices.net>
- <jayson@desertservices.net>
- <chi@desertservices.net>

### Other Templates

| Template | Audience | Purpose |
|----------|----------|---------|
| `sandstorm-sign-order` | Vendor (Sandstorm Signs) | Simple sign order emails from Kerin |

## Variables by Template

### Customer Templates

#### dust-permit-submitted

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `siteAddress`, `acreage`

#### dust-permit-issued

- `recipientName`, `accountName`, `projectName`
- `actionStatus` - "processed and approved" / "closed"
- `permitStatus` - "Active" / "Closed"
- `applicationNumber`, `permitNumber`, `siteAddress`, `acreage`
- `issueDate`, `expirationDate`
- `showPermitInfo` - set to "true" for new (not closeout)

#### dust-permit-revised

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `permitNumber`, `siteAddress`, `acreage`
- `issueDate`, `expirationDate`
- `changesHtml` - HTML list items (e.g., `<li><div>Increased acreage: 1.2 → 2.5 acres</div></li>`)

#### dust-permit-renewed

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `siteAddress`, `acreage`
- `issueDate`, `expirationDate`

#### dust-permit-reminder

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `permitNumber`, `siteAddress`, `expirationDate`

### Billing Templates

All billing templates share the same payment information structure for QuickBooks clearing accounts.

#### Common Variables (All Billing Templates)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`

**Payment Information (for QuickBooks clearing accounts):**

- `vendorName` - Who was paid (e.g., "Maricopa County Air Quality Department")
- `paymentMethod` - "Credit Card" or "Vendor Invoice"
- `cardLastFour` - Last 4 digits of card used (required for credit card payments)
- `cardholderName` - Name on the card (required for credit card payments)
- `confirmationId` (optional) - Payment confirmation ID for credit card payments
- `paymentDate` (optional) - Date payment was processed

#### dust-permit-billing (new permit)

- All common variables above
- `permitNumber` (optional) - May be pending when first submitted

#### dust-permit-billing-revised (revision)

- All common variables above
- `supersededApplicationNumber` - Previous application number
- `permitNumber` - Facility ID
- `changesHtml` - HTML list items describing changes made

#### dust-permit-billing-renewed (renewal)

- All common variables above
- `supersededApplicationNumber` - Previous application number
- `permitNumber` - Facility ID

### Other Templates

#### sandstorm-sign-order (vendor)

Simple template for sign orders to Sandstorm Signs.

**Recipient:** `kelli@sandstormsign.com` (54/58 initial sign orders go here). `designer@sandstormsign.com` is only used in replies from Sandstorm.

**Subject format:** `MM.DD.YY Sign Order` or `MM.DD.YY [Sign Type] sign order`

**Variables:**

- `signDetails` - Main sign order content (e.g., "1 SWPPP sign needed", "1 dust and 1 SWPPP sign") - **Required**
- `additionalMessage` (optional) - Any additional instructions or notes
- `showDoubleExclamation` - Set to "true" for "Thank you!!" instead of "Thank you!" (default: false)

**Common sign types:**

- SWPPP signs
- Dust signs
- SWPPP stickers
- Dust stickers
- Fire Access signs
- Job Information signs

## Usage Examples

### Customer Template Example

```typescript
import { getTemplate, getLogoAttachment } from './services/email/templates';
import { GraphEmailClient } from './services/email';

const email = new GraphEmailClient({...});
await email.initUserAuth();

// Send to customer
const html = await getTemplate('dust-permit-issued', {
  recipientName: 'LeAnn',
  accountName: 'Caliente Construction',
  projectName: 'Kiwanis Playground',
  actionStatus: 'processed and approved',
  permitStatus: 'Active',
  applicationNumber: 'D0064940',
  permitNumber: 'F054321',
  siteAddress: '6111 S All-America Way, Tempe AZ 85283',
  acreage: '1.2',
  issueDate: 'December 17, 2025',
  expirationDate: 'December 17, 2026',
  showPermitInfo: 'true',
});

const logo = await getLogoAttachment();

await email.sendEmail({
  to: [{ email: 'leann@caliente.com' }], // Customer only
  subject: 'Dust Permit Approved - Kiwanis Playground',
  body: html,
  bodyType: 'html',
  attachments: [logo],
});
```

### Billing Template Example

```typescript
// Send to internal billing team
const billingHtml = await getTemplate('dust-permit-billing', {
  recipientName: 'Team',
  accountName: 'Caliente Construction',
  projectName: 'Kiwanis Playground',
  applicationNumber: 'D0064940',
  address: '6111 S All-America Way, Tempe AZ 85283',
  acceleratedProcessing: 'No',
  vendorName: 'Maricopa County Air Quality Department',
  permitCost: '$150.00',
  scheduleValue: '$5,000.00',
  paymentMethod: 'Credit Card',
  cardLastFour: '1234',
  cardholderName: 'Chi Ejimofor',
  invoiceNumber: 'INV-2025-001',
  invoiceDate: 'December 18, 2025',
  projectFolderLink: 'https://example.sharepoint.com/projects/kiwanis',
});

await email.sendEmail({
  to: [
    { email: 'don@desertservices.net' },
    { email: 'francine@desertservices.net' },
    { email: 'kendra@desertservices.net' },
    { email: 'eva@desertservices.net' },
    { email: 'jayson@desertservices.net' },
    { email: 'chi@desertservices.net' },
  ], // Internal billing team only
  subject: 'Dust Permit Billing - Kiwanis Playground',
  body: billingHtml,
  bodyType: 'html',
  attachments: [logo],
});
```

---

## Future Improvements

- **projectFolderLink**: Removed from billing templates for now. Add back when SharePoint folder automation is ready (auto-create project folders, generate links).

---

## Agent Workflow Notes

**For AI Agents**: When creating email drafts or sending emails, always ask the user in conversation if they want to attach any files before proceeding. Do not add interactive CLI prompts - ask naturally in the conversation flow.

Example: "✓ Draft created. Would you like me to attach any files to this draft?"
