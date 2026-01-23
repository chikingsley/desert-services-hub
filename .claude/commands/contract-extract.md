# Contract Extract

Extract structured data from a processed contract using Claude Code.

## Usage

```
/contract-extract [contract_id]
```

If no contract_id provided, shows list of contracts pending extraction.

## Process

1. **Get contract text**
   ```bash
   bun -e "
   import { getFullText } from './services/contract/extraction/storage';
   import { db } from './lib/db';

   const id = $ARGUMENTS || null;

   if (!id) {
     // List contracts pending extraction
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
       console.log(\`  \${c.id}: \${c.filename} \${status}\`);
     }
     process.exit(0);
   }

   const text = getFullText(Number(id));
   if (!text) {
     console.error('Contract not found or no text extracted');
     process.exit(1);
   }
   console.log('CONTRACT_TEXT_START');
   console.log(text);
   console.log('CONTRACT_TEXT_END');
   "
   ```

2. **Extract all 7 data domains from the contract text**

   Read the contract text and extract:

   ### Contract Info (EXTR-01)
   - contractType: LOI | Subcontract | WorkOrder | Amendment | Unknown
   - contractDate (YYYY-MM-DD)
   - contractValue (number in USD)
   - projectName
   - projectNumber
   - projectAddress
   - startDate, endDate
   - generalContractor name
   - pageReferences (page numbers where found)

   ### Billing (EXTR-02)
   - retentionPercent
   - billingPlatform: Textura | Procore | GCPay | Premier | Email | Other
   - billingWindow (e.g., "15th of month")
   - billingContact (name, email, phone)
   - certifiedPayrollRequired (boolean)
   - certifiedPayrollType: DavisBacon | HUD | StatePrevailingWage | None
   - pageReferences

   ### Contacts (EXTR-03)
   - projectManager: name, phone, email
   - superintendent: name, phone, email
   - pageReferences

   ### Schedule of Values (EXTR-04)
   - sovIncluded (boolean)
   - lineItems: array of { item, description, value }
   - scopeSummary: brief description of work
   - pageReferences

   ### Insurance (EXTR-05)
   - glLimits, umbrellaLimits, autoLimits, workersCompLimits
   - coiRequired (boolean)
   - additionalInsured (boolean)
   - waiverOfSubrogation (boolean)
   - primaryNonContributory (boolean)
   - bondingRequired (boolean)
   - bondAmount
   - pageReferences

   ### Site Info (EXTR-06)
   - siteAddress
   - siteHours
   - accessInstructions
   - safetyRequirements: array of strings
   - pageReferences

   ### Red Flags (EXTR-07)
   - unusualTerms: array of { term, concern, pageRef }
   - maintenanceLanguage: boolean + details if found
   - tmLanguage: boolean + details if found
   - vagueLanguage: array of vague clauses
   - missingInfo: array of expected but missing items
   - overallRiskLevel: Low | Medium | High
   - pageReferences

3. **Store extraction results**
   ```bash
   bun -e "
   import { storeAgentResult } from './services/contract/agents/storage';

   const contractId = $CONTRACT_ID;
   const results = $EXTRACTION_RESULTS; // JSON object with all 7 domains

   for (const [agentName, data] of Object.entries(results)) {
     storeAgentResult(contractId, agentName, data, 'success', null, 0);
     console.log(\`Stored: \${agentName}\`);
   }
   console.log('Extraction complete');
   "
   ```

4. **Report summary**
   Show what was extracted with key findings.

## Notes

- Pages are separated by "---PAGE BREAK---" markers in the text
- Use null for any field not found in the document
- Always include pageReferences for traceability
- Red flags should highlight anything unusual or concerning
