"""Subagent definitions for contract intake workflow."""

from google.adk.agents import LlmAgent

from src.config import settings
from src.prompts import (
    DEEP_RESEARCHER_PROMPT,
    EMAIL_DRAFTER_PROMPT,
    MONDAY_CHECKER_PROMPT,
    NOTION_UPDATER_PROMPT,
    RECONCILER_PROMPT,
)


def create_deep_researcher(tools: list | None = None) -> LlmAgent:
    """Create deep research subagent for email/document discovery.

    This agent implements the CRAWL -> COLLECT -> READ -> COMPILE pattern
    to find all related information about a project.
    """
    return LlmAgent(
        name="deep_researcher",
        model=settings.default_model,
        instruction=DEEP_RESEARCHER_PROMPT,
        description=(
            "Use this agent to research a project by searching emails, "
            "downloading attachments, and compiling findings. "
            "Triggers on: 'research this project', 'find all emails about', "
            "'what do we know about [project]'"
        ),
        tools=tools or [],
    )


def create_monday_checker(tools: list | None = None) -> LlmAgent:
    """Create Monday.com checker subagent.

    This agent searches the ESTIMATING board to find matching estimates
    and extracts key data (ID, value, scope, line items).
    """
    return LlmAgent(
        name="monday_checker",
        model=settings.default_model,
        instruction=MONDAY_CHECKER_PROMPT,
        description=(
            "Use this agent to find estimates in Monday.com. "
            "Searches by project name, contractor name, or address. "
            "Returns estimate ID, value, and scope summary."
        ),
        tools=tools or [],
    )


def create_reconciler() -> LlmAgent:
    """Create contract reconciliation subagent.

    This agent compares contract vs estimate, identifies variances,
    and determines the outcome (Match, Revised, Clarification Needed).
    """
    return LlmAgent(
        name="reconciler",
        model=settings.default_model,
        instruction=RECONCILER_PROMPT,
        description=(
            "Use this agent to reconcile a contract against an estimate. "
            "Compares totals, line items, identifies additions/removals, "
            "and determines if they match or need clarification."
        ),
        tools=[],  # Pure reasoning, no tools needed
    )


def create_notion_updater(tools: list | None = None) -> LlmAgent:
    """Create Notion updater subagent.

    This agent creates or updates Notion project records with
    contract details, reconciliation results, and next actions.
    """
    return LlmAgent(
        name="notion_updater",
        model=settings.default_model,
        instruction=NOTION_UPDATER_PROMPT,
        description=(
            "Use this agent to create or update Notion projects. "
            "Creates project records, links estimates, sets status, "
            "and adds reconciliation summaries."
        ),
        tools=tools or [],
    )


def create_email_drafter() -> LlmAgent:
    """Create email drafting subagent.

    This agent drafts internal-contracts emails and client clarification
    emails based on reconciliation results.
    """
    return LlmAgent(
        name="email_drafter",
        model=settings.default_model,
        instruction=EMAIL_DRAFTER_PROMPT,
        description=(
            "Use this agent to draft emails. "
            "Creates internal-contracts summary emails and "
            "client clarification emails when needed."
        ),
        tools=[],  # Returns draft content, doesn't send
    )
