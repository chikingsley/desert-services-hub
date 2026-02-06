# COUNTY NOTIFICATION: Payment Confirmation - PointAndPay

**Date:** January 19, 2026
**Type:** Automated Payment Confirmation
**Source:** PointAndPay (Maricopa County payment processor)
**Sender:** [noreply@pointandpay.com](mailto:noreply@pointandpay.com)

## Email Content

**From:** [noreply@pointandpay.com](mailto:noreply@pointandpay.com)
**To:** [chi@desertservices.net](mailto:chi@desertservices.net)
**Subject:** Your Maricopa Air Quality payment has been approved

> Your Maricopa County Air Quality Department payment has been authorized and will be processed soon.
>
> Please see below for the details of your payment:
>
> Product: Invoices - Account Number: IV087518 - Amount: $1,130.00
>
> Sub Total: $1,130.00
> Fee: $0.00
> Total: $1,130.00
>
> ~~~~~~~~~~~~~~~~~~~~~~ {: .text}
>
> Payment Details:
>
> Confirmation ID: 190292754
> Invoice Number: 87518
> Facility Name:
> Company Name:
> Payment Date: 01/19/2026 01:22 PM US Mountain Time
> Account Last Four: 8113
> Customer Phone Number: (304) 216-8700
>
> ~~~~~~~~~~~~~~~~~~~~~~~
> Thank you.
>
> To reach the Maricopa County Air Quality Department, please call (602) 506-6010

## Data Points Extracted

- Confirmation ID: 190292754
- Invoice Number: 87518 (IV087518)
- Payment Amount: $1,130.00
- Payment Date: 01/19/2026 01:22 PM
- Card Last 4: 8113
- Fee: $0.00

## Pattern Notes

- Subject line: "Your Maricopa Air Quality payment has been approved"
- Sender: [noreply@pointandpay.com](mailto:noreply@pointandpay.com)
- Sent immediately after successful payment
- Contains Invoice Number that links to permit application
- Facility Name/Company Name often blank in confirmation
- No Application ID or Facility ID (those come from county)

## Common Fee Amounts

- $1,060.00 - Standard dust control application fee (DAF)
- $1,130.00 - Application fee with additional charges
- Varies based on acreage and permit type

## Workflow Position

This is the SECOND notification in the permit lifecycle:
1. Submission Confirmation - Application received
2. **Payment Confirmation** (this) - Fee paid
3. Permit Issued OR Rejected - County decision

## Related: FIS Gov Payment Confirmations

Older payments may come from [donotreply@fisgov.com](mailto:donotreply@fisgov.com) with subject "Maricopa County- Air Quality - Payment Confirmation" - same data, different processor.

## Message ID

- Original: AAMkAGNlMTg3ZjA4LTg2YzItNDY2Ni04YTE1LWFiMTc3ZjhiMDc3OABGAAAAAAAhDXTY8w53Torp3ocMi3LrBwBsg8nFR4iVSaVqRK9_FQ1sAAAAAAEMAABsg8nFR4iVSaVqRK9_FQ1sAABBXlLcAAA=
