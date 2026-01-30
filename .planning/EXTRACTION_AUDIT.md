# Contract Extraction Audit Report

Generated: 2026-01-23T15:28:44.774Z

---

## Contract 12: Trailhead_Multifamily_-_Desert_Services_PO.pdf

### billing

**Status:** success

```json
{
  "totalAmount": 20170,
  "subtotal": 20170,
  "salesTax": 0,
  "paymentTerms": "Net 30 Days",
  "invoiceEmail": "ap@laytonconstruction.com",
  "fob": "Buyers Facility (Seller bears risk until delivery)",
  "priceType": "Fixed - order shall not be filled at higher price"
}
```css
```json
{
  "gcProjectContact": {
    "name": "Travis Kahanek",
    "phone": "480-790-1485",
    "fax": "602-840-8646",
    "role": "Project Manager"
  },
  "deliveryLocation": {
    "address": "Happy Valley and Westwing Pkwy, Peoria, AZ 85383",
    "instructions": "Seller to provide shipping"
  },
  "invoiceContact": {
    "email": "ap@laytonconstruction.com"
  }
}
```css
```json
{
  "documentType": "Purchase Order",
  "poNumber": "45900568",
  "orderCode": "022200-MA",
  "projectName": "Trailhead Multifamily",
  "issueDate": "2025-12-22",
  "deliveryDate": "2026-01-05",
  "generalContractor": "Layton Construction Company, LLC",
  "gcAddress": "9090 South Sandy Parkway, Sandy, UT 84070",
  "gcPhone": "801-568-9090",
  "gcFax": "801-569-5451",
  "subcontractor": "Desert Services",
  "subAddress": "PO Box 236, Scottsdale, AZ 85252",
  "subPhone": "480-513-8986",
  "scopeOfWork": "SWPPP materials and services",
  "governingLaw": "State of Arizona"
}
```css
```json
{
  "requirementsNoted": false,
  "notes": "No specific insurance requirements mentioned in PO. Standard indemnification clause in Section X requires Seller to indemnify Buyer and Owner for personal injury and property damage arising from negligent acts."
}
```css
```json
{
  "flags": [
    {
      "category": "Liquidated Damages",
      "severity": "high",
      "description": "Section XII: 0.3% of Product price per day for late drawings/vendor data; 0.7% per day for late final Product delivery"
    },
    {
      "category": "Warranty",
      "severity": "medium",
      "description": "Section IV: 18 months from shipment OR 12 months from operation warranty period including labor costs for removal/repair/installation"
    },
    {
      "category": "Indemnification",
      "severity": "medium",
      "description": "Section X: Broad indemnification including claims where Buyer is concurrently negligent"
    },
    {
      "category": "IP Transfer",
      "severity": "low",
      "description": "Section III: Buyer owns all work product including creative ideas by Seller"
    },
    {
      "category": "Termination for Convenience",
      "severity": "medium",
      "description": "Section IX: Buyer can terminate without cause; Seller waives loss of profits claims"
    }
  ],
  "overallRisk": "medium-high"
}
```css
```json
{
  "projectName": "Trailhead Multifamily",
  "deliveryAddress": "Happy Valley and Westwing Pkwy, Peoria, AZ 85383",
  "city": "Peoria",
  "state": "AZ",
  "zip": "85383",
  "projectType": "Multifamily Residential Construction"
}
```css
```json
{
  "lineItems": [
    {
      "description": "SWPPP Manual",
      "quantity": 1,
      "unit": "EA",
      "amount": 1350
    },
    {
      "description": "9\" Compost Filter Sock",
      "quantity": 3840,
      "unit": "LF",
      "amount": 10560
    },
    {
      "description": "SWPPP Sign",
      "quantity": 1,
      "unit": "EA",
      "amount": 275
    },
    {
      "description": "Spill Kit (2)",
      "quantity": 2,
      "unit": "EA",
      "amount": 690
    },
    {
      "description": "Dust Control Sign",
      "quantity": 1,
      "unit": "EA",
      "amount": 575
    },
    {
      "description": "Fire Access Sign",
      "quantity": 1,
      "unit": "EA",
      "amount": 675
    },
    {
      "description": "SWPPP Inspection",
      "quantity": 27,
      "unit": "Total",
      "amount": 5535
    },
    {
      "description": "Mobilization (2)",
      "quantity": 2,
      "unit": "EA",
      "amount": 510
    }
  ],
  "totalLineItems": 8,
  "subtotal": 20170,
  "total": 20170
}
```css
```json
{
  "retentionPercent": null,
  "billingPlatform": "Procore",
  "billingWindow": null,
  "billingContact": null,
  "certifiedPayrollRequired": null,
  "certifiedPayrollType": null,
  "pageReferences": [
    5
  ]
}
```css
```json
{
  "projectManager": null,
  "superintendent": {
    "name": "Steve Rankich",
    "phone": "602-541-4234",
    "email": null
  },
  "pageReferences": [
    1
  ]
}
```css
```json
{
  "contractType": "LOI",
  "contractDate": "2026-01-14",
  "contractValue": null,
  "projectName": "Sprouts 058 Rita Ranch",
  "projectNumber": "251056-008",
  "projectAddress": "Houghton Rd. & Old Vail Rd. (NWC), Tucson, AZ 85747",
  "startDate": null,
  "endDate": null,
  "generalContractor": "A.R. Mays Construction",
  "pageReferences": [
    1,
    2
  ]
}
```css
```json
{
  "glLimits": null,
  "umbrellaLimits": null,
  "autoLimits": null,
  "workersCompLimits": null,
  "coiRequired": true,
  "additionalInsured": null,
  "waiverOfSubrogation": null,
  "primaryNonContributory": null,
  "bondingRequired": false,
  "bondAmount": null,
  "insuranceExpiration": {
    "generalLiability": "2026-11-01",
    "autoLiability": "2026-11-01",
    "workersComp": "2026-07-31",
    "professionalLiability": null
  },
  "pageReferences": [
    1
  ]
}
```css
```json
{
  "unusualTerms": [
    {
      "term": "Subcontractor assumes responsibility of all fines",
      "concern": "Full liability for dust control non-compliance fines",
      "pageRef": 3
    },
    {
      "term": "No warning notice for cleanup charges",
      "concern": "GC can hire laborers and backcharge without warning",
      "pageRef": 5
    },
    {
      "term": "Multiple mobilizations acknowledged",
      "concern": "Work will be completed in multiple mobilizations - potential scheduling complexity",
      "pageRef": 3
    },
    {
      "term": "Liquated damages clause",
      "concern": "Liable for impacted trades expenses and consequential damages including lost rent",
      "pageRef": 6
    }
  ],
  "maintenanceLanguage": false,
  "tmLanguage": false,
  "vagueLanguage": [
    "Submittals within 10 calendar days - tight timeline",
    "Materials held for duration of project - no end date specified"
  ],
  "missingInfo": [
    "Contract value not stated",
    "Project start/end dates not specified",
    "Retention percentage not specified",
    "PM contact not provided"
  ],
  "overallRiskLevel": "Medium",
  "pageReferences": [
    1,
    2,
    3,
    4,
    5,
    6
  ]
}
```css
```json
{
  "siteAddress": "Houghton Rd. & Old Vail Rd. (NWC), Tucson, AZ 85747",
  "siteHours": null,
  "accessInstructions": "Coordinate lay-down area with AR Mays Project Superintendent for ALL incoming FOB deliveries at least 72 hours prior",
  "safetyRequirements": [
    "Weekly onsite Safety meetings mandatory",
    "All OSHA regulations must be adhered to at all times",
    "All P.P.E. safety gear must be adhered at all times",
    "Fall protection required",
    "Competent supervision required on site at all times"
  ],
  "pageReferences": [
    2,
    3,
    4,
    5
  ]
}
```css
```json
{
  "sovIncluded": true,
  "lineItems": [
    {
      "item": "32-40",
      "description": "SWPPP Plan Design per ADEQ specifications",
      "value": null
    },
    {
      "item": "32-33",
      "description": "SWPPP Plan Narrative and ADEQ Compliant Book/Inspection Log",
      "value": null
    },
    {
      "item": "34",
      "description": "Site perimeter silt fence or wattle",
      "value": null
    },
    {
      "item": "35",
      "description": "Inlet protection at all storm drain inlets",
      "value": null
    },
    {
      "item": "36",
      "description": "SWPPP Signage with AZPDES authorization number",
      "value": null
    },
    {
      "item": "37",
      "description": "Dust control signage per local municipal requirements",
      "value": null
    },
    {
      "item": "38",
      "description": "GC direction for all AHJ permits related to SWPPP",
      "value": null
    },
    {
      "item": "39",
      "description": "Spill kit to job site",
      "value": null
    },
    {
      "item": "40",
      "description": "SWPPP inspections every 14 days for 9 months",
      "value": null
    },
    {
      "item": "30",
      "description": "GSA temporary entrance and lay down area",
      "value": null
    },
    {
      "item": "31",
      "description": "Test all lines at completion",
      "value": null
    }
  ],
  "scopeSummary": "SWPPP design, installation, and inspection services including site perimeter controls, inlet protection, signage, permits, and ongoing inspections for Sprouts grocery store construction project.",
  "pageReferences": [
    2,
    3
  ]
}
```

---
