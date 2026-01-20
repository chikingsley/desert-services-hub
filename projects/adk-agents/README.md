# DS ADK Agents

Agentic workflows for Desert Services using Google's Agent Development Kit (ADK).

## Overview

This project implements multi-agent orchestration for contract intake and research workflows:

- **Contract Intake Orchestrator**: Full workflow from email → Monday → reconciliation → Notion
- **Deep Research Agent**: CRAWL → COLLECT → READ → COMPILE pattern for email research
- **Monday Checker**: Find and extract estimate data from Monday.com
- **Reconciler**: Compare contract vs estimate, identify variances
- **Notion Updater**: Create/update project records
- **Email Drafter**: Draft internal and client communications

## Quick Start

### Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) for package management
- Docker (optional, for containerized deployment)
- Google API key for Gemini models

### Local Development

```bash
# Install dependencies
uv sync --extra dev

# Copy environment file and fill in values
cp .env.example .env

# Run with hot reload
uv run uvicorn src.main:app --reload --reload-dir src

# Or use ADK's built-in dev UI
uv run adk web
```

### Docker Development (Hot Reload)

```bash
# Start with hot reload - edit src/ and changes apply immediately
docker compose up

# With ADK web UI for debugging
docker compose --profile debug up
```

### Run Tests

```bash
uv run pytest
```

### Lint

```bash
uv run ruff check src/ tests/
uv run ruff format src/ tests/
```

## Project Structure

```text
projects/adk-agents/
├── src/
│   ├── agents/           # Agent definitions
│   │   ├── orchestrator.py   # Main contract intake orchestrator
│   │   └── subagents.py      # Individual subagent definitions
│   ├── prompts/          # Agent instruction prompts
│   │   ├── deep_researcher.py
│   │   ├── monday_checker.py
│   │   ├── reconciler.py
│   │   ├── notion_updater.py
│   │   └── email_drafter.py
│   ├── tools/            # MCP tool integrations
│   │   └── mcp.py            # Connect to email, Monday, Notion MCPs
│   ├── config.py         # Settings from environment
│   └── main.py           # FastAPI application
├── tests/                # pytest tests
├── Dockerfile            # Multi-stage build (dev + prod)
├── docker-compose.yml    # Dev environment with hot reload
├── pyproject.toml        # Project config (uv, ruff, pytest)
└── .env.example          # Environment template
```

## API Endpoints

### Health Check
```bash
curl http://localhost:8000/health
```

### Contract Intake
```bash
curl -X POST http://localhost:8000/contract-intake \
  -H "Content-Type: application/json" \
  -d '{"project_name": "Sun Health La Loma", "contractor_name": "Sundt"}'
```

### Deep Research
```bash
curl -X POST http://localhost:8000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "Find all emails about Wesley Dobson SWPPP estimate"}'
```

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                 Contract Intake Request                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              LoopAgent (Orchestrator)                    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         LlmAgent (Coordinator)                   │    │
│  │                                                  │    │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐     │    │
│  │   │  Deep    │  │  Monday  │  │Reconciler│     │    │
│  │   │Researcher│  │ Checker  │  │          │     │    │
│  │   └──────────┘  └──────────┘  └──────────┘     │    │
│  │                                                  │    │
│  │   ┌──────────┐  ┌──────────┐                   │    │
│  │   │  Notion  │  │  Email   │                   │    │
│  │   │ Updater  │  │ Drafter  │                   │    │
│  │   └──────────┘  └──────────┘                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Loop until: <complete>CONTRACT_INTAKE_DONE</complete>   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  MCP Tools: Email | Monday | Notion                      │
└─────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_API_KEY` | Google AI API key for Gemini | Yes |
| `AZURE_TENANT_ID` | Azure AD tenant ID | For email |
| `AZURE_CLIENT_ID` | Azure app client ID | For email |
| `AZURE_CLIENT_SECRET` | Azure app secret | For email |
| `MONDAY_API_KEY` | Monday.com API key | For Monday |
| `NOTION_API_KEY` | Notion API key | For Notion |
| `DEFAULT_MODEL` | Default Gemini model | No (gemini-2.5-flash) |
| `ORCHESTRATOR_MODEL` | Model for orchestrator | No (gemini-2.5-pro) |

## Deployment

### Cloud Run

```bash
# Build production image
docker build --target prod -t ds-adk-agents .

# Push to GCR
docker tag ds-adk-agents gcr.io/PROJECT_ID/ds-adk-agents
docker push gcr.io/PROJECT_ID/ds-adk-agents

# Deploy
gcloud run deploy ds-adk-agents \
  --image gcr.io/PROJECT_ID/ds-adk-agents \
  --platform managed \
  --region us-central1 \
  --set-env-vars "GOOGLE_API_KEY=..." \
  --allow-unauthenticated
```
