# Dust Permit Email Templates

## Email Flow

| Step | Customer Template | Internal Template | Trigger |
|------|-------------------|-------------------|---------|
| 1 | `dust-permit-submitted` | `dust-permit-billing` | Permit submitted to county |
| 2 | `dust-permit-issued` | - | Permit approved |
| 3 | `dust-permit-revised` | `dust-permit-billing-revised` | Revision submitted/approved |
| 4 | `dust-permit-reminder` | - | 2-4 weeks before expiration |
| 5 | `dust-permit-renewed` | `dust-permit-billing-renewed` | Renewal submitted/approved |
| 6 | `dust-permit-issued` (closeout) | - | Closeout confirmed |

## Templates

| Template | Audience | Purpose |
|----------|----------|---------|
| `dust-permit-billing` | Internal | Billing notification for new permit (costs, invoice) |
| `dust-permit-billing-revised` | Internal | Billing notification for revision (costs, changes) |
| `dust-permit-billing-renewed` | Internal | Billing notification for renewal (costs, invoice) |
| `dust-permit-submitted` | Customer | Notification when permit submitted (5-10 business days) |
| `dust-permit-issued` | Customer | Approval/Closeout confirmation |
| `dust-permit-revised` | Customer | Revision confirmation (includes Changes Made) |
| `dust-permit-renewed` | Customer | Renewal confirmation (includes superseded app) |
| `dust-permit-reminder` | Customer | Renewal reminder before expiration |
| `sandstorm-sign-order` | Vendor (Sandstorm Signs) | Simple sign order emails from Kerin |

## Recipients

### Internal (billing templates)

- <kendra@desertservices.net>
- <jayson@desertservices.net>
- <eva@desertservices.net>

### Customer

- Primary project contact
- Additional contacts (from Notion field)

## Variables by Template

### dust-permit-billing (internal - new permit)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`

**Payment Information (for QuickBooks clearing accounts):**

- `vendorName` - Who was paid (e.g., "Maricopa County Air Quality Department")
- `paymentMethod` - "Credit Card" or "Vendor Invoice"
- `confirmationId` (optional) - Payment confirmation ID for credit card payments
- `paymentDate` (optional) - Date payment was processed
- `cardLastFour` (optional) - Last 4 digits of card used
- `cardholderName` (optional) - Name on the card

### dust-permit-billing-revised (internal - revision)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`
- `changesHtml` - HTML list items for changes

**Payment Information (for QuickBooks clearing accounts):**

- `vendorName`, `paymentMethod`
- `confirmationId`, `paymentDate`, `cardLastFour`, `cardholderName` (all optional)

### dust-permit-billing-renewed (internal - renewal)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`

**Payment Information (for QuickBooks clearing accounts):**

- `vendorName`, `paymentMethod`
- `confirmationId`, `paymentDate`, `cardLastFour`, `cardholderName` (all optional)

### dust-permit-submitted (customer)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `siteAddress`, `acreage`

### dust-permit-issued (customer - approved/closeout)

- `recipientName`, `accountName`, `projectName`
- `actionStatus` - "processed and approved" / "closed"
- `permitStatus` - "Active" / "Closed"
- `applicationNumber`, `permitNumber`, `siteAddress`, `acreage`
- `issueDate`, `expirationDate`
- `showPermitInfo` - set to "true" for new (not closeout)

### dust-permit-revised (customer)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `permitNumber`, `siteAddress`, `acreage`
- `issueDate`, `expirationDate`
- `changesHtml` - HTML list items (e.g., `<li><div>Increased acreage: 1.2 → 2.5 acres</div></li>`)

### dust-permit-renewed (customer)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `siteAddress`, `acreage`
- `issueDate`, `expirationDate`

### dust-permit-reminder (customer)

- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `permitNumber`, `siteAddress`, `expirationDate`

### sandstorm-sign-order (vendor - Sandstorm Signs)

Simple template for sign orders to Sandstorm Signs. Based on patterns from 129+ emails.

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

**Example:**

```typescript
const html = await getTemplate('sandstorm-sign-order', {
  signDetails: '1 SWPPP sign needed',
});

await email.sendEmail({
  to: [{ email: 'kelli@sandstormsign.com' }],
  subject: '01.26.26 SWPPP sign order',
  body: html,
  bodyType: 'html',
  attachments: [logo],
});
```

## Usage Example

```typescript
import { getTemplate, getLogoAttachment } from './services/email/templates';
import { GraphEmailClient } from './services/email';

const email = new GraphEmailClient({...});
await email.initUserAuth();

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
  to: [
    { email: 'leann@caliente.com' },
    { email: 'kendra@desertservices.net' },
    { email: 'jayson@desertservices.net' },
    { email: 'eva@desertservices.net' },
  ],
  subject: 'Dust Permit Approved - Kiwanis Playground',
  body: html,
  bodyType: 'html',
  attachments: [logo],
});
```
