# Plan Analysis Utility with Gemini 3 Flash Agentic Vision

A powerful utility for analyzing civil engineering plans (grading, drainage, SWPPP) using Gemini 3 Flash's agentic vision capabilities. Features zoom, detailed inspection, and structured compliance checking.

## 🎯 What It Does

This utility leverages Gemini 3 Flash's **Agentic Vision** to:
- **Think → Act → Observe**: Multi-step image analysis with code execution
- **Zoom & Inspect**: Automatically crop and examine specific plan areas
- **Count & Measure**: Accurate element counting and measurement extraction
- **Compliance Check**: Verify plans against requirements
- **Structured Reporting**: JSON output for integration with workflows

## 📦 Project Structure

```
plan-analysis/
├── src/
│   └── plan_analysis/
│       ├── __init__.py              # Package exports
│       ├── plan_analyzer.py         # Core analysis engine with agentic vision
│       ├── plan_analyzer_examples.py # Usage examples
│       └── cli.py                   # CLI for OCR and comparison
├── pyproject.toml                   # UV/Ruff configuration
└── README.md                        # This file
```

## 🚀 Quick Start (with Just)

### 1. Install Dependencies

```bash
just plan-install
```

Or manually:
```bash
cd plan-analysis
uv sync
uv add --dev -e ".[dev]"
```

### 2. Set API Key

```bash
export GEMINI_API_KEY="your-api-key-here"
```

### 3. Run Example

```bash
just plan-example
```

### 4. Basic Usage

```python
from plan_analysis import quick_analyze

# Analyze a SWPPP plan
result = quick_analyze(
    image_path='./plans/swppp-plan.pdf',
    plan_type='swppp'
)

print(f"Confidence: {result.confidence_score:.2%}")
print(f"Elements found: {len(result.findings)}")
print(f"Compliance: {result.compliance_items}")
```

### 5. Detailed Inspection

```python
from plan_analysis import PlanAnalyzer

analyzer = PlanAnalyzer()

inspection = analyzer.detailed_inspection(
    image_path='./plans/grading-plan.pdf',
    inspection_prompt="""
    Count all sediment basins and verify dimensions.
    Use code execution to crop each basin area for closer inspection.
    """
)
```

## 🔍 Plan Types Supported

### SWPPP Plans
- Sediment basins/traps identification
- Silt fences and barriers
- Inlet protection
- Construction entrances
- Erosion control coverage
- Compliance verification

### Grading Plans
- Contour line analysis
- Cut and fill areas
- Slope calculations
- Drainage patterns
- Property setbacks
- Utility clearances

### Drainage Plans
- Pipe infrastructure
- Inlet and manhole locations
- Flow directions
- Hydraulic calculations
- Connection points
- Outfall locations

## 🔧 Advanced Usage

### Multiple Focus Areas

```python
result = analyzer.analyze_plan(
    image_path='./plans/civil-plan.pdf',
    plan_type='civil',
    analysis_focus=[
        'drainage_infrastructure',
        'erosion_controls',
        'utility_locations'
    ],
    specific_areas=[
        'northwest drainage basin',
        'main entrance',
        'retention pond area'
    ]
)
```

### Batch Processing

```python
import glob

plans = glob.glob('./plans-to-review/*.pdf')
results = []

for plan in plans:
    result = analyzer.analyze_plan(plan, plan_type='swppp')
    results.append({
        'file': plan,
        'passed': all(
            item['status'] == 'pass' 
            for item in result.compliance_items
        )
    })
```

## 🔬 Why Gemini 3 Flash?

Testing showed Gemini 3 Flash provides significantly better OCR accuracy for construction documents compared to traditional OCR engines:

| Issue | Traditional OCR | Gemini 3 Flash |
|-------|----------------|----------------|
| "BUILDING CODE" | "MILKING CODE" | ✓ Correct |
| Repeated garbage | "DIMENSIONS ARE INCREASED" ×17 | ✓ Clean output |
| Technical drawings | Garbled | ✓ Structured data |
| Measurements | Missed | ✓ Extracted with units |

**All documents** (contracts, plans, drawings) use Gemini 3 Flash as the sole OCR engine.

### CLI Usage

```bash
cd plan-analysis/

# Basic OCR
just ocr /path/to/plan.pdf

# Limit to first 5 pages
just ocr-limit /path/to/plan.pdf 5
```

## 📊 Output Format

### AnalysisResult Structure

```json
{
  "plan_type": "swppp",
  "analysis_type": "general",
  "findings": [
    {
      "type": "sediment_basin",
      "count": 3,
      "locations": ["northwest corner", "south entrance"]
    }
  ],
  "measurements": {
    "area_acres": 5.2,
    "linear_feet": 1250.0
  },
  "compliance_items": [
    {
      "item": "sediment_basin_coverage",
      "status": "pass",
      "notes": "All drainage areas covered"
    }
  ],
  "detailed_inspections": [
    {
      "area": "northwest basin",
      "findings": "Properly sized, 1000 cu ft volume",
      "coordinates": [100, 200, 300, 400]
    }
  ],
  "recommendations": [
    "Verify maintenance access to basin #2"
  ],
  "confidence_score": 0.94,
  "raw_analysis": "..."
}
```

## 🎓 How Agentic Vision Works

Gemini 3 Flash's agentic vision uses a **Think → Act → Observe** loop:

1. **Think**: Model analyzes the plan and formulates inspection strategy
2. **Act**: Generates Python code to:
   - Crop specific regions
   - Zoom into details
   - Count elements
   - Calculate measurements
3. **Observe**: Examines transformed images and refines analysis
4. **Report**: Generates structured findings with confidence scores

Example of code execution:
```python
# Gemini generates code like this:
from PIL import Image
img = Image.open("plan.png")

# Crop to sediment basin area
basin_area = img.crop((100, 200, 400, 600))
basin_area.save("basin_zoom.png")

# Count elements
count = len(detect_sediment_basins(basin_area))
```

## 💡 Tips for Best Results

1. **High Resolution**: Use high-quality plan images (300+ DPI)
2. **Clear Prompts**: Be specific in inspection prompts
3. **PDF to Image**: Large PDFs are automatically converted to high-res images
4. **Multiple Passes**: Run different analyses for comprehensive review
5. **Validate**: Always validate critical compliance items manually

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |

Get your API key at: https://ai.google.dev/

## 📚 Resources

- [Gemini 3 Flash Agentic Vision Blog](https://blog.google/innovation-and-ai/technology/developers-tools/agentic-vision-gemini-3-flash/)
- [PlanCheckSolver.com](http://planchecksolver.com/) - Reference implementation
- [Google AI Studio](https://aistudio.google.com/) - Test agentic vision

## 🐛 Troubleshooting

**Issue**: `ImportError: No module named 'google.genai'`
**Fix**: `uv add google-genai`

**Issue**: PDF conversion fails
**Fix**: `uv add PyMuPDF`

**Issue**: API rate limits
**Fix**: Implement delays between batch processing calls

## 📄 License

Internal use for Desert Services plan review workflows.

---

Built with Gemini 3 Flash Agentic Vision | Powered by Google GenAI
