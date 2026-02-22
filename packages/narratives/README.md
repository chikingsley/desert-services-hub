# SWPPP Document Generator

Generates SWPPP (Stormwater Pollution Prevention Plan) documents from NOI + estimate data using Google Gemini for PDF extraction and `docxtpl` for Word template rendering.

## Setup

```bash
cp .env.example .env
# Add your GEMINI_API_KEY to .env
uv sync
```

## Run

```bash
uv run --directory packages/narratives uvicorn swppp.server:app --host 0.0.0.0 --port 8000
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/v1/swppp/validate` | Validate SWPPP data |
| POST | `/api/v1/swppp/generate` | Generate document, return path |
| POST | `/api/v1/swppp/generate-and-download` | Generate and download document |
| POST | `/api/v1/swppp/validate-canonical` | Validate canonical payload |
| POST | `/api/v1/swppp/generate-from-canonical` | Deterministic generation from canonical payload |

Swagger UI available at `/docs`.
