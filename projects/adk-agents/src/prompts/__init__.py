"""Agent prompts for contract intake workflow."""

from src.prompts.deep_researcher import DEEP_RESEARCHER_PROMPT
from src.prompts.email_drafter import EMAIL_DRAFTER_PROMPT
from src.prompts.monday_checker import MONDAY_CHECKER_PROMPT
from src.prompts.notion_updater import NOTION_UPDATER_PROMPT
from src.prompts.orchestrator import ORCHESTRATOR_PROMPT
from src.prompts.reconciler import RECONCILER_PROMPT

__all__ = [
    "DEEP_RESEARCHER_PROMPT",
    "EMAIL_DRAFTER_PROMPT",
    "MONDAY_CHECKER_PROMPT",
    "NOTION_UPDATER_PROMPT",
    "ORCHESTRATOR_PROMPT",
    "RECONCILER_PROMPT",
]
