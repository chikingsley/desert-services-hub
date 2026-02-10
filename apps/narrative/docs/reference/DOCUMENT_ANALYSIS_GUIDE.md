# Document Analysis System - Setup Guide

## What I Built

A **document analysis system** that extracts SWPPP variables from PDFs using Claude AI.

### Key Components

1. **`app/models/swppp_variables.py`** - Complete schema for all SWPPP variables
2. **`app/services/document_analyzer.py`** - PDF analyzer using Claude API
3. **`test_document_analysis.py`** - Test script to demo extraction

## How It Works

```
PDFs → Claude Vision API → Structured JSON → Pydantic Models → Review → Generate SWPPP
```

### The Magic: Claude "Reads" Your PDFs

Instead of brittle parsing logic, we ask Claude to extract specific data:

**You:** "What is the project address in this PDF?"
**Claude:** Reads the PDF, finds it, returns structured JSON

**Benefits:**
- ✅ Works with scanned PDFs (OCR built-in)
- ✅ Works when format changes
- ✅ Understands context (knows "client" vs "prepared by")
- ✅ Extracts from tables automatically
- ✅ No complex parsing code to maintain

## Setup Instructions

### 1. Get Claude API Key

1. Go to https://console.anthropic.com/
2. Create account or log in
3. Go to "API Keys"
4. Create new key
5. Copy the key (starts with `sk-ant-`)

### 2. Set API Key

```bash
# Option 1: Environment variable (recommended)
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Option 2: Or add to .env file
echo 'ANTHROPIC_API_KEY="sk-ant-your-key-here"' >> .env
```

### 3. Test Extraction

```bash
# Make sure you're in the project directory
cd /path/to/AutoNarrative

# Run the test
uv run python test_document_analysis.py
```

## What Gets Extracted

### From Estimate (Desert Services PDF)

```json
{
  "client_company": "41 North Contractors, LLC",
  "client_contact": "Eddie Bersi",
  "client_address": "4933 Lincoln Ave, Lisle IL 60532",
  "client_phone": "...",
  "job_name": "STARBUCKS MARICOPA",
  "job_location": "42590 W MARICOPA CASA GRANDE HWY, AZ 85138",
  "estimator_name": "Jared Aiken",
  "estimate_number": "10012504",
  "estimate_date": "2025-10-02",
  "inspection_schedule": "every 14 days and 1/2 in rain @ $195.00 each",
  "bmps_found": [
    {
      "code": "ASPC-5",
      "name": "Compost Filter Sock",
      "description": "Installation of 9\" Compost Filter Sock...",
      "quantity": "2,355 LF"
    },
    {
      "name": "Rock Entrance",
      "description": "Rock Entrance installed with Rock and Filterfabric...",
      "quantity": "1 Each"
    }
    // ... more BMPs
  ]
}
```

### From Storm Plan (Engineering PDF)

```json
{
  "project_name": "STARBUCKS",
  "project_address": "42590 W MARICOPA CASA GRANDE HWY",
  "city": "MARICOPA",
  "state": "AZ",
  "zip_code": "85138",
  "county": "Pinal",
  "latitude": 33.something,
  "longitude": -111.something,
  "site_area_acres": 1.31,
  "building_area_sf": 2432,
  "parking_spaces": 36,
  "receiving_water": "Morrison Creek",
  "civil_engineer_company": "Lars Andersen & Associates, Inc.",
  "developer": "Rainier Partners, LLC"
}
```

## Expected Output

When you run the test, you'll see:

```
🚀 SWPPP Document Analysis Test
============================================================

TESTING: Estimate Extraction
============================================================

📄 Analyzing: 0098-25 Signed-Approved Est_10012504...
⏳ Sending to Claude API...

✅ Extraction successful!

📊 EXTRACTED DATA:
------------------------------------------------------------

🏢 CLIENT INFO:
  Company: 41 North Contractors, LLC
  Contact: Eddie Bersi
  ...

📋 BMPs FOUND (7):
  1. SWPPP Narrative
     Code: N/A
     Quantity: 1 Each
     ...

💾 Full results saved to: extracted_estimate.json

============================================================
TESTING: Storm Plan Extraction
============================================================
...
```

Two JSON files will be created:
- `extracted_estimate.json` - Data from estimate
- `extracted_storm_plan.json` - Data from storm plan

## Cost

Very cheap! Approximately:
- **Estimate PDF:** ~$0.05-0.10 per analysis
- **Storm Plan PDF:** ~$0.20-0.40 per analysis (larger file)

**Total per SWPPP:** ~$0.50-1.00

Compare to **30-60 minutes of manual work** = you're saving $25-100 per SWPPP!

## Next Steps After Extraction

1. **Review extracted JSON** - Check accuracy
2. **Merge data sources** - Combine estimate + storm plan + NOI
3. **Build review interface** - Let human approve/correct data
4. **Generate SWPPP** - Fill template with approved data

## Current Status

### ✅ Completed
- Variable schema designed
- Document analyzers built for Estimate and Storm Plan
- Test script created
- Anthropic SDK installed

### ⏳ Next (After Testing)
- Variable merger (combines estimate + storm plan + NOI data)
- Review interface (web form to correct extracted data)
- Integration with template generation

## Troubleshooting

### Error: "No API key provided"

Make sure you set the environment variable:
```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### Error: "File not found"

Make sure you're in the project root directory where the PDFs are located.

### Extraction looks wrong

The prompts can be tuned! Edit `app/services/document_analyzer.py` and adjust the extraction prompts for better results.

### Claude not finding a field

Add more specific instructions in the prompt, or provide an example of what you're looking for.

## Advanced: Using Other LLMs

Want to use Gemini or GPT-4V instead of Claude?

The `DocumentAnalyzer` class can be adapted to use any vision model. The key is the structured prompts - they work with any LLM!

## Ready to Test?

Run this command and see the magic:

```bash
export ANTHROPIC_API_KEY="your-key-here"
uv run python test_document_analysis.py
```

Let me know what you see!
