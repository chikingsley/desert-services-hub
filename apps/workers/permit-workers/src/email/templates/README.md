# Dust Permit Email Templates

## Email Flow

| Step | Customer Template | Internal Template | Trigger |
|------|-------------------|-------------------|---------|
| 1 | `01-dust-permit-submitted` | `02-dust-permit-billing` | Permit submitted to county |
| 2 | `03-dust-permit-issued` | - | Permit approved |
| 3 | `04-dust-permit-revised` | `05-dust-permit-billing-revised` | Revision submitted/approved |
| 4 | `06-dust-permit-reminder` | - | 2-4 weeks before expiration |
| 5 | `07-dust-permit-renewed` | `08-dust-permit-billing-renewed` | Renewal submitted/approved |
| 6 | `03-dust-permit-issued` (closeout) | - | Closeout confirmed |

## Templates

| Template | Audience | Purpose |
|----------|----------|---------|
| `01-dust-permit-submitted` | Customer | Notification when permit submitted (5-10 business days) |
| `02-dust-permit-billing` | Internal | Billing notification for new permit (costs, invoice) |
| `03-dust-permit-issued` | Customer | Approval/Closeout confirmation |
| `04-dust-permit-revised` | Customer | Revision confirmation (includes Changes Made) |
| `05-dust-permit-billing-revised` | Internal | Billing notification for revision (costs, changes) |
| `06-dust-permit-reminder` | Customer | Renewal reminder before expiration |
| `07-dust-permit-renewed` | Customer | Renewal confirmation (includes superseded app) |
| `08-dust-permit-billing-renewed` | Internal | Billing notification for renewal (costs, invoice) |

## Recipients

### Internal (billing templates)
- kendra@desertservices.net
- jayson@desertservices.net
- eva@desertservices.net

### Customer
- Primary project contact
- Additional contacts (from Notion field)

## Variables by Template

### 01-dust-permit-submitted (customer)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `siteAddress`, `acreage`

### 02-dust-permit-billing (internal - new permit)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`

### 03-dust-permit-issued (customer - approved/closeout)
- `recipientName`, `accountName`, `projectName`
- `actionStatus` - "processed and approved" / "closed"
- `permitStatus` - "Active" / "Closed"
- `applicationNumber`, `permitNumber`, `siteAddress`, `acreage`
- `issueDate`, `expirationDate`
- `showPermitInfo` - set to "true" for new (not closeout)

### 04-dust-permit-revised (customer)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `permitNumber`, `siteAddress`, `acreage`
- `issueDate`, `expirationDate`
- `changesHtml` - HTML list items (e.g., `<li><div>Increased acreage: 1.2 → 2.5 acres</div></li>`)

### 05-dust-permit-billing-revised (internal - revision)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`
- `changesHtml` - HTML list items for changes

### 06-dust-permit-reminder (customer)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `permitNumber`, `siteAddress`, `expirationDate`

### 07-dust-permit-renewed (customer)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `siteAddress`, `acreage`
- `issueDate`, `expirationDate`

### 08-dust-permit-billing-renewed (internal - renewal)
- `recipientName`, `accountName`, `projectName`
- `applicationNumber`, `supersededApplicationNumber`, `permitNumber`
- `address`, `acceleratedProcessing`
- `permitCost`, `acceleratedFee` (optional), `scheduleValue`
- `invoiceNumber`, `invoiceDate`, `projectFolderLink`

## Usage Example

```typescript
import { getTemplate, getLogoAttachment } from './services/email/templates';
import { GraphEmailClient } from './services/email';

const email = new GraphEmailClient({...});
await email.initUserAuth();

const html = await getTemplate('03-dust-permit-issued', {
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
