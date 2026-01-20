"""FastAPI application for ADK agents."""

import asyncio
import logging
import os
from collections.abc import Callable, Coroutine
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from google.adk.agents import LlmAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.events.event import Event
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel

from src.agents import create_contract_intake_orchestrator, create_simple_research_orchestrator
from src.config import settings

# Set GOOGLE_API_KEY environment variable for google-genai to pick up
# pydantic-settings loads from .env but doesn't set actual env vars
if settings.google_api_key:
    os.environ["GOOGLE_API_KEY"] = settings.google_api_key

from src.tools import get_email_tools, get_monday_tools, get_notion_tools

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def extract_final_response(events: list[Event]) -> str:
    """Extract the final text response from a list of events."""
    for event in reversed(events):
        if event.content and event.content.parts:
            text = "".join(part.text or "" for part in event.content.parts)
            if text.strip():
                return text.strip()
    return "No response generated"


class ContractIntakeRequest(BaseModel):
    """Request to process a contract."""

    project_name: str | None = None
    contractor_name: str | None = None
    email_subject: str | None = None
    instructions: str | None = None


class ResearchRequest(BaseModel):
    """Request to do deep research."""

    query: str
    mailboxes: list[str] | None = None


class TokenUsage(BaseModel):
    """Token usage statistics."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0


# Pricing per 1M tokens (as of Jan 2025)
# Source: https://ai.google.dev/pricing
MODEL_PRICING: dict[str, dict[str, float]] = {
    # Gemini 3 series (preview)
    "gemini-3-flash-preview": {"input": 0.075, "output": 0.30},
    "gemini-3-pro-preview": {"input": 1.25, "output": 5.00},
    # Gemini 2.5 series
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash-lite": {"input": 0.01875, "output": 0.075},
    "gemini-2.5-pro": {"input": 1.25, "output": 5.00},
    # Fallback for unknown models
    "default": {"input": 0.075, "output": 0.30},
}


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calculate cost in USD based on model and token counts."""
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["default"])
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 6)


class AgentResponse(BaseModel):
    """Response from agent execution."""

    status: str
    result: str
    iterations: int
    tokens: TokenUsage | None = None
    model: str | None = None


@dataclass
class AppState:
    """Application state for MCP tools."""

    email_tools: list = field(default_factory=list)
    monday_tools: list = field(default_factory=list)
    notion_tools: list = field(default_factory=list)


app_state = AppState()


def extract_token_usage(events: list[Event], model: str) -> TokenUsage:
    """Sum up token usage from all events with usage_metadata."""
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    for event in events:
        if event.usage_metadata:
            prompt_tokens += event.usage_metadata.prompt_token_count or 0
            completion_tokens += event.usage_metadata.candidates_token_count or 0
            total_tokens += event.usage_metadata.total_token_count or 0
    cost = calculate_cost(model, prompt_tokens, completion_tokens)
    return TokenUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_usd=cost,
    )


async def run_agent(agent: BaseAgent, task: str, app_name: str, model: str | None = None) -> AgentResponse:
    """Run an agent and return a standardized response."""
    model = model or settings.default_model
    runner = InMemoryRunner(agent=agent, app_name=app_name)
    try:
        logger.info("Starting %s: %s", app_name, task[:100])
        events = await runner.run_debug(task, quiet=True)
        result = extract_final_response(events)
        tokens = extract_token_usage(events, model)
        logger.info(
            "%s completed with %d events, %d tokens ($%.6f)",
            app_name,
            len(events),
            tokens.total_tokens,
            tokens.cost_usd,
        )
        return AgentResponse(
            status="completed",
            result=result,
            iterations=len(events),
            tokens=tokens,
            model=model,
        )
    except Exception as e:
        logger.exception("%s failed", app_name)
        return AgentResponse(status="error", result=f"Agent execution failed: {e}", iterations=0)


ToolLoader = Callable[[], Coroutine[Any, Any, list]]

TOOL_LOADERS: dict[str, tuple[ToolLoader, str]] = {
    "email": (get_email_tools, "email_tools"),
    "monday": (get_monday_tools, "monday_tools"),
    "notion": (get_notion_tools, "notion_tools"),
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize MCP connections on startup."""
    logger.info("Initializing MCP connections...")

    try:
        results = await asyncio.gather(
            *[loader() for loader, _ in TOOL_LOADERS.values()],
            return_exceptions=True,
        )

        for (name, (_, attr)), result in zip(TOOL_LOADERS.items(), results, strict=True):
            if isinstance(result, Exception):
                logger.warning("%s MCP failed: %s", name.capitalize(), result)
            else:
                setattr(app_state, attr, result)
                logger.info("%s tools loaded: %d tools", name.capitalize(), len(result))

    except Exception:
        logger.exception("Error initializing MCP connections")

    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="DS ADK Agents",
    description="Desert Services ADK-based agentic workflows",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model": settings.default_model,
        "tools": {
            "email": len(app_state.email_tools),
            "monday": len(app_state.monday_tools),
            "notion": len(app_state.notion_tools),
        },
    }


def get_tools_or_none() -> dict[str, list | None]:
    """Get current tools, converting empty lists to None."""
    return {
        "email_tools": app_state.email_tools or None,
        "monday_tools": app_state.monday_tools or None,
        "notion_tools": app_state.notion_tools or None,
    }


@app.post("/contract-intake", response_model=AgentResponse)
async def contract_intake(request: ContractIntakeRequest) -> AgentResponse:
    """Process a contract through the full intake workflow."""
    if not any([request.project_name, request.contractor_name, request.email_subject]):
        raise HTTPException(
            status_code=400,
            detail="Must provide at least one of: project_name, contractor_name, email_subject",
        )

    task_parts = ["Process contract intake for:"]
    if request.project_name:
        task_parts.append(f"- Project: {request.project_name}")
    if request.contractor_name:
        task_parts.append(f"- Contractor: {request.contractor_name}")
    if request.email_subject:
        task_parts.append(f"- Email subject: {request.email_subject}")
    if request.instructions:
        task_parts.append(f"\nAdditional instructions: {request.instructions}")

    orchestrator = create_contract_intake_orchestrator(**get_tools_or_none())
    return await run_agent(orchestrator, "\n".join(task_parts), "contract-intake")


@app.post("/research", response_model=AgentResponse)
async def research(request: ResearchRequest) -> AgentResponse:
    """Do deep research on a topic via email search and attachment analysis."""
    orchestrator = create_simple_research_orchestrator(email_tools=app_state.email_tools or None)

    query = request.query
    if request.mailboxes:
        query += f"\n\nSearch in mailboxes: {', '.join(request.mailboxes)}"

    return await run_agent(orchestrator, query, "research")


class TestMondayRequest(BaseModel):
    """Request to test Monday.com MCP tools."""

    query: str = "Find all estimates"


@app.post("/test-monday", response_model=AgentResponse)
async def test_monday(request: TestMondayRequest) -> AgentResponse:
    """Test Monday.com MCP tools directly."""
    agent = LlmAgent(
        name="monday_tester",
        model=settings.default_model,
        instruction="Search Monday.com and return the results.",
        tools=app_state.monday_tools or [],
    )
    return await run_agent(agent, request.query, "monday-test")


# =============================================================================
# WEBHOOK ENDPOINTS
# =============================================================================


class WebhookResponse(BaseModel):
    """Response for webhook calls."""

    accepted: bool
    message: str
    task_id: str | None = None


# Background task storage (in production, use Redis/DB)
background_tasks_status: dict[str, dict] = {}


async def run_background_agent(task_id: str, agent: BaseAgent, task: str, app_name: str) -> None:
    """Run an agent as a background task with status tracking."""
    background_tasks_status[task_id] = {"status": "processing", "result": None}
    response = await run_agent(agent, task, app_name)
    background_tasks_status[task_id] = {
        "status": response.status,
        "result": response.result,
        "iterations": response.iterations,
    }


async def process_email_trigger(message_id: str, task_id: str) -> None:
    """Process an incoming email and trigger contract intake if relevant."""
    orchestrator = create_contract_intake_orchestrator(**get_tools_or_none())
    task = f"""A new email arrived (message ID: {message_id}).

Please:
1. Fetch this email to see its contents
2. Determine if it's contract-related (signed contract, DocuSign, agreement, etc.)
3. If yes, process it through the full contract intake workflow
4. If no, respond with "Not a contract email - no action needed"
"""
    await run_background_agent(task_id, orchestrator, task, "email-trigger")


@app.post("/webhooks/email", response_model=WebhookResponse)
async def email_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> WebhookResponse:
    """Receive Microsoft Graph email notifications.

    This endpoint handles:
    1. Validation requests (returns validationToken)
    2. New email notifications (triggers contract intake if relevant)
    """
    # Handle validation request from Microsoft Graph
    validation_token = request.query_params.get("validationToken")
    if validation_token:
        logger.info("Email webhook validation request received")
        # Must return the token as plain text for validation
        return PlainTextResponse(content=validation_token)  # type: ignore[return-value]

    # Parse the notification payload
    try:
        body = await request.json()
        notifications = body.get("value", [])

        for notification in notifications:
            change_type = notification.get("changeType")
            resource = notification.get("resource", "")

            # Only process new emails
            if change_type == "created" and "/Messages/" in resource:
                # Extract message ID from resource path
                message_id = resource.split("/Messages/")[-1]
                task_id = f"email-{message_id[:8]}-{asyncio.get_event_loop().time()}"

                # Process in background so webhook returns quickly
                background_tasks.add_task(process_email_trigger, message_id, task_id)

                logger.info("Queued email processing: %s", task_id)

                return WebhookResponse(
                    accepted=True,
                    message="Email queued for processing",
                    task_id=task_id,
                )

        return WebhookResponse(
            accepted=True,
            message="Notification received but no actionable emails",
            task_id=None,
        )

    except Exception as e:
        logger.exception("Failed to process email webhook")
        return WebhookResponse(
            accepted=False,
            message=f"Failed to process: {e}",
            task_id=None,
        )


@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str) -> dict:
    """Check the status of a background task."""
    if task_id not in background_tasks_status:
        raise HTTPException(status_code=404, detail="Task not found")
    return background_tasks_status[task_id]


@app.post("/trigger/contract")
async def manual_trigger_contract(
    email_subject: str,
    background_tasks: BackgroundTasks,
) -> WebhookResponse:
    """Manually trigger contract intake for testing."""
    task_id = f"manual-{asyncio.get_event_loop().time()}"

    async def process() -> None:
        orchestrator = create_contract_intake_orchestrator(**get_tools_or_none())
        task = f"Find and process the contract email with subject containing: {email_subject}"
        await run_background_agent(task_id, orchestrator, task, "manual-trigger")

    background_tasks.add_task(process)
    return WebhookResponse(
        accepted=True,
        message=f"Contract intake triggered for: {email_subject}",
        task_id=task_id,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",  # noqa: S104 - Intentional for Docker
        port=8000,
        reload=True,
        reload_dirs=["src"],
    )
