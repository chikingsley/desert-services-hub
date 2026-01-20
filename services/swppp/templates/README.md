# SWPPP Email Templates

## Overview

Email templates for SWPPP (Stormwater Pollution Prevention Plan) workflow notifications. These are triggered by the Monday.com SWPPP board via n8n webhook.

## Templates

| Template | Purpose | Trigger |
|----------|---------|---------|
| `swppp-plan-requested` | Notify team when SWPPP plan is ordered from vendor | Item created/status change |
| `swppp-plan-received` | Notify team when SWPPP plan is delivered (with attachment) | Plan uploaded to Monday |

## Variables

### swppp-plan-requested
| Variable | Description | Example |
|----------|-------------|---------|
| `vendorName` | SWPPP vendor/provider name | "Alta Environmental & Infrastructure" |
| `jobName` | Project/job name | "SUNRISE APARTMENTS" |
| `customerName` | Client company name | "Fina CDM LLC" |
| `jobLocation` | Project location | "Glendale, AZ, USA" |

### swppp-plan-received
Same variables as `swppp-plan-requested`, plus:
- Attachment: The SWPPP plan PDF from Monday.com

## Recipients (Internal)

- kendra@desertservices.net
- jayson@desertservices.net
- eva@desertservices.net
- (optional) chi@desertservices.net

## n8n Workflow Integration

The workflow is triggered by a webhook from Monday.com and:
1. Receives item ID from Monday webhook
2. Fetches item details (job name, customer, location)
3. Gets attached estimate/SWPPP plan file
4. Renders template with project variables
5. Sends email via Microsoft Graph (Outlook node)

## Usage Example

```typescript
import { loadTemplate, fillTemplate } from '../email/templates';
import path from 'path';

const templatePath = path.join(__dirname, 'templates', 'swppp-plan-received.hbs');
const template = await loadTemplate(templatePath);

const html = fillTemplate(template, {
  vendorName: 'Alta Environmental & Infrastructure',
  jobName: 'SUNRISE APARTMENTS',
  customerName: 'Fina CDM LLC',
  jobLocation: 'Glendale, AZ, USA',
});
```
