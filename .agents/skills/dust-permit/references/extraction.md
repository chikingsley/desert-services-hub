# Data Extraction Reference

Extract structured data from NOI and SWPPP documents for dust permit applications.

---

## NOI Extraction

Extract project and contact information from Notice of Intent (NOI) PDFs.

### Algorithm: READ → EXTRACT → VALIDATE → OUTPUT

1. **READ** the entire NOI PDF
2. **EXTRACT** fields from document sections
3. **VALIDATE** required fields and formats
4. **OUTPUT** structured JSON

### Fields to Extract

#### Applicant Information (Section 1)

| Field | Where to Find | Example |
|-------|---------------|---------|
| `applicantName` | "Applicant" or "Company Name" | "Ryan Companies US, Inc." |
| `applicantAddress1` | Street address | "2100 Ross Ave, Suite 2400" |
| `applicantCity` | City | "Dallas" |
| `applicantState` | State | "TX" |
| `applicantZip` | Zip code | "75201" |

#### Site Information (Section 2)

| Field | Where to Find | Example |
|-------|---------------|---------|
| `siteName` | "Project Name" or "Site Name" | "Banner Verrado Medical Center" |
| `siteAddress` | "Project Location" | "Section 6, 1N, 2W" |
| `latitude` | GPS coordinates | 33.4484 |
| `longitude` | GPS coordinates | -112.074 |
| `acresDisturbed` | "Total Area to be Disturbed" | 9.5 |

#### SWPPP Contact Information (Section 3)

| Field | Where to Find | Example |
|-------|---------------|---------|
| `swpppContactFirstName` | "SWPPP Contact" first name | "Darin" |
| `swpppContactLastName` | "SWPPP Contact" last name | "Krier" |
| `swpppContactEmail` | Contact email | "<darin@company.com>" |
| `swpppContactPhone` | Contact phone | "(480) 555-1234" |

### Validation Rules

- Latitude: 30-38 (Arizona range)
- Longitude: -115 to -108 (Arizona range)
- Acreage: > 0
- Phone: 10 digits
- Email: contains @

### Critical Rules

**Do NOT guess missing data** - Return `null` if field not found.

**Do NOT confuse sections** - Use SWPPP Contact (Section 3) for primaryContact, not Applicant Contact.

**Do format consistently** - Phone: `(XXX) XXX-XXXX`

---

## SWPPP/Plan Extraction

Extract dust control measures from SWPPP plans and site drawings.

### Algorithm: READ → IDENTIFY → MAP → OUTPUT

1. **READ** the SWPPP document
2. **IDENTIFY** which activities occur on site
3. **MAP** activities to permit categories
4. **OUTPUT** structured JSON

### Activity Identification

| Activity | Look For | Maps To |
|----------|----------|---------|
| Staging areas | "Staging", "laydown area" | B.1 |
| Haul roads | "Access road", "haul route" | B.2 |
| Mass grading | "Mass grading", earthwork quantities | F.1 |
| Fine grading | "Fine grading", "finish grade" | F.2 |
| Underground utilities | "Utility trench", "sewer" | G.1 |
| Vertical construction | "Building", "foundation" | G.2 |
| Demolition | "Demo", "demolition" | H |
| Material hauling | "Import", "export" | D.1-D.5 |
| Trackout | Site exits, wheel wash | E.1-E.2 |
| Blasting | "Blasting", "rock removal" | J |
| Weed abatement | "Clearing", "grubbing" | I |

### Category Mapping

**Always apply**: A, C.1-C.4, K (water supply)

**Typical construction**: B.1, B.2, D.2, D.4, E.2, F.1, F.2, G.2

**Only if mentioned**: D.1 (export), D.3 (public crossing), D.5 (storage piles), E.1 (trackout device), G.1 (underground), H (demo), I (weed), J (blasting)

### Control Measure Defaults

| Measure | Default | Rationale |
|---------|---------|-----------|
| Water application | Primary | Most common dust control |
| Paving | Contingency | Backup for high dust |
| Gravel | Contingency | Backup stabilization |
| Dust suppressants | None | Cost/environmental concerns |
| Cease operations | Contingency | High wind fallback |

### Critical Rules

**Do NOT apply categories unnecessarily** - Only mark `applies: true` if evidence in the plan.

**Do cross-reference with NOI** - Use NOI's acreage and coordinates if available.

**Do note timeline information** - Look for construction schedule, phase dates.

---

## Output Format

### NOI Extraction Output

```json
{
  "applicantName": "Ryan Companies US, Inc.",
  "applicantAddress1": "2100 Ross Ave",
  "applicantCity": "Dallas",
  "applicantState": "TX",
  "applicantZip": "75201",
  "siteName": "Banner Verrado Medical Center",
  "latitude": 33.4484,
  "longitude": -112.074,
  "acresDisturbed": 9.5,
  "swpppContactFirstName": "Darin",
  "swpppContactLastName": "Krier",
  "swpppContactEmail": "darin@company.com",
  "swpppContactPhone": "(480) 555-1234",
  "_extraction": {
    "source": "noi",
    "confidence": "high",
    "missingFields": [],
    "warnings": []
  }
}
```

### Plan Extraction Output

```json
{
  "projectInfo": {
    "startDate": "01/27/2026",
    "endDate": "01/27/2027",
    "siteAcreage": 9.5,
    "hasDemolitionOrRenovation": false
  },
  "categoryB1": { "applies": true, "water": "Primary", "gravel": "Contingency" },
  "categoryF1": { "applies": true },
  "categoryF2": { "applies": true },
  "categoryG2": { "applies": true },
  "categoryK": { "waterSources": { "hydrant": true }, "waterMethods": { "truck": true } },
  "_extraction": {
    "source": "plan",
    "confidence": "medium",
    "identifiedActivities": ["mass grading", "fine grading", "vertical construction"],
    "warnings": ["No trackout device specified"]
  }
}
```

---

## Integration

After extraction, data is used by:
- `buildFormData()` in `src/form-data.ts`
- Saved to `data/overrides/<project>.json`
- Passed to CLI via `--form-data` flag
