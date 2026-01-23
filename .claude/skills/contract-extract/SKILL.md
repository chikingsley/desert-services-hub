---
description: Extract structured data from a processed contract PDF. Use when a contract has been dropped into the pipeline and needs data extraction, or when user says "extract this contract" or "contract extract".
user_invocable: true
---

# Contract Extract Skill

Extract structured data from contract text stored in the database.

## When to Use

- User says "extract this contract" or "contract extract"
- User wants to extract data from a processed contract
- Pipeline has processed a PDF and it's ready for extraction
- User provides a contract ID to extract

## Workflow

### 1. Get Contract Text

If no contract ID provided, list recent contracts:

```bash
bun -e "
import { db } from './lib/db';

const pending = db.query(\`
  SELECT pc.id, pc.filename, pc.processed_at,
         (SELECT COUNT(*) FROM contract_extractions ce WHERE ce.contract_id = pc.id) as extraction_count
  FROM processed_contracts pc
  WHERE pc.status = 'completed'
  ORDER BY pc.id DESC
  LIMIT 10
\`).all();

console.log('Recent contracts:');
for (const c of pending) {
  const status = c.extraction_count > 0 ? '(extracted)' : '(pending)';
  console.log('  ' + c.id + ': ' + c.filename + ' ' + status);
}
"
```

Then get the full text for the specified contract:

```bash
bun -e "
import { getFullText } from './services/contract/extraction/storage';
const text = getFullText({CONTRACT_ID});
console.log(text);
"
```

### 2. Extract All 7 Data Domains

Read the contract text and extract these domains. Pages are separated by `---PAGE BREAK---` markers.

#### Contract Info (EXTR-01)
- contractType: LOI | Subcontract | WorkOrder | Amendment | Unknown
- contractDate (YYYY-MM-DD)
- contractValue (number in USD, null if not stated)
- projectName, projectNumber
- projectAddress
- startDate, endDate
- generalContractor
- pageReferences

#### Billing (EXTR-02)
- retentionPercent
- billingPlatform: Textura | Procore | GCPay | Premier | Email | Other | null
- billingWindow
- billingContact: { name, email, phone }
- certifiedPayrollRequired (boolean)
- certifiedPayrollType: DavisBacon | HUD | StatePrevailingWage | None | null
- pageReferences

#### Contacts (EXTR-03)
- projectManager: { name, phone, email }
- superintendent: { name, phone, email }
- pageReferences

#### Schedule of Values (EXTR-04)
- sovIncluded (boolean)
- lineItems: array of { item, description, value }
- scopeSummary: brief description of work scope
- pageReferences

#### Insurance (EXTR-05)
- glLimits, umbrellaLimits, autoLimits, workersCompLimits
- coiRequired (boolean)
- additionalInsured, waiverOfSubrogation, primaryNonContributory (booleans)
- bondingRequired (boolean), bondAmount
- insuranceExpiration: { generalLiability, autoLiability, workersComp, professionalLiability } (dates)
- pageReferences

#### Site Info (EXTR-06)
- siteAddress
- siteHours
- accessInstructions
- safetyRequirements: array of strings
- pageReferences

#### Red Flags (EXTR-07)
- unusualTerms: array of { term, concern, pageRef }
- maintenanceLanguage: boolean (+ details if true)
- tmLanguage: boolean (+ details if true)
- vagueLanguage: array of vague clauses
- missingInfo: array of expected but missing items
- overallRiskLevel: Low | Medium | High
- pageReferences

### 3. Store Results

Store each domain's extraction:

```bash
bun -e "
import { storeAgentResult } from './services/contract/agents/storage';

const contractId = {CONTRACT_ID};

// Store each domain
storeAgentResult(contractId, 'contractInfo', {CONTRACT_INFO_JSON}, 'success', null, 0);
storeAgentResult(contractId, 'billing', {BILLING_JSON}, 'success', null, 0);
storeAgentResult(contractId, 'contacts', {CONTACTS_JSON}, 'success', null, 0);
storeAgentResult(contractId, 'sov', {SOV_JSON}, 'success', null, 0);
storeAgentResult(contractId, 'insurance', {INSURANCE_JSON}, 'success', null, 0);
storeAgentResult(contractId, 'siteInfo', {SITE_INFO_JSON}, 'success', null, 0);
storeAgentResult(contractId, 'redFlags', {RED_FLAGS_JSON}, 'success', null, 0);

console.log('Extraction stored for contract ' + contractId);
"
```

### 4. Report Summary

Output a summary table:

| Domain | Key Findings |
|--------|--------------|
| Contract Info | {type}, {GC name}, Project #{number} |
| Contacts | Super: {name} ({phone}) |
| Insurance | COI required: {yes/no}, Expires: {dates} |
| SOV | {N} line items, Scope: {summary} |
| Billing | Platform: {platform}, Retention: {%} |
| Site Info | {N} safety requirements |
| Red Flags | {risk level} - {count} unusual terms, {count} missing items |

## Extraction Guidelines

- Use `null` for any field not found in the document
- Always include pageReferences for traceability
- Red flags should highlight anything unusual or concerning
- For dates, use YYYY-MM-DD format
- For currency, use numbers without symbols

## Example

**Input:** `/contract-extract 10`

**Output:**
```
Contract 10: Desert Services LOI & SOW.pdf
Extracted 7/7 domains successfully

| Domain | Key Findings |
|--------|--------------|
| Contract Info | LOI from A.R. Mays, Project #251056-008, Sprouts Rita Ranch |
| Contacts | Super: Steve Rankich (602-541-4234) |
| Insurance | COI required, GL expires 11/1/2026 |
| SOV | 11 SWPPP line items |
| Billing | Procore platform |
| Site Info | 5 safety requirements |
| Red Flags | Medium risk - 4 unusual terms, 4 missing items |
```
