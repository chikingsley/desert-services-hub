# AutoNarrative

AutoNarrative is an AI-powered system that automates the generation of SWPPP (Stormwater Pollution Prevention Plan) documents. It extracts data from construction estimates and engineering plans using Google Gemini AI and populates standard Word templates.

## 📁 Project Structure

```text
.
├── app/                    # Main application code
│   ├── api/                # FastAPI endpoints
│   ├── models/             # Pydantic data models (Strict Validation)
│   └── services/           # Business logic (Gemini Extraction, Mapping, Generation)
├── data/
│   ├── samples/            # Input PDFs (Estimates, Plans)
│   └── extracted/          # JSON data extracted from PDFs (Intermediate files)
├── docs/
│   ├── DEVELOPER_GUIDE.md  # HOW IT WORKS & HOW TO RUN
│   ├── TODO.md             # Current tasks
│   └── reference/          # Deep-dive analysis and archives
├── scripts/
│   ├── generate_swppp.py   # MASTER SCRIPT: Runs the full pipeline
│   ├── run_extraction_demo.py  # Test: Extraction only
│   ├── run_generation_demo.py  # Test: Generation only
│   ├── test_mapper.py          # Test: Data Mapping logic
│   ├── utils/                  # Utility scripts (e.g., template inspection)
│   └── archive/                # One-off setup scripts (template injection)
└── templates/
    ├── cgp_p3_template.docx    # The Master Word Template
    └── output/                 # Generated SWPPP documents
```

## 🚀 Quick Start

### 1. Setup

Ensure you have `uv` installed (or use pip). You also need a Google Gemini API Key.

1.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
2.  Add your API Key to `.env`:
    ```text
    GEMINI_API_KEY=your_key_here
    ```
3.  Install dependencies:
    ```bash
    uv sync
    ```

### 2. Run the Full Pipeline

The master script runs the entire workflow: **PDF -> AI Extraction -> Data Mapping -> Intermediate Review -> Word Document**.

```bash
uv run python scripts/generate_swppp.py
```

**What happens:**
1.  It reads PDFs from `data/samples/`.
2.  It saves a "Review File" at `data/extracted/intermediate_swppp_data.json`.
3.  It generates the final document at `templates/output/generated_swppp.docx`.

### 3. Manual Testing (Optional)

*   **Test Extraction Only:**
    ```bash
    uv run python scripts/run_extraction_demo.py
    ```
*   **Test Template Generation Only:**
    ```bash
    uv run python scripts/run_generation_demo.py
    ```
*   **Test Data Mapper Only:**
    ```bash
    uv run python scripts/test_mapper.py
    ```

### 4. Utilities

*   **Inspect Template Placeholders:**
    ```bash
    uv run python scripts/utils/inspect_template.py
    ```

## 📚 Documentation

*   **[Developer Guide](docs/DEVELOPER_GUIDE.md)**: Detailed explanation of the architecture, how to edit templates, and how the AI extraction works.
*   **[To-Do List](TODO.md)**: Current roadmap and tasks.