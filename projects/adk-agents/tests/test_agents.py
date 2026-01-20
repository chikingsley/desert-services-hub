"""Tests for ADK agent definitions."""

from src.agents import (
    create_contract_intake_orchestrator,
    create_deep_researcher,
    create_monday_checker,
    create_notion_updater,
    create_reconciler,
)


class TestSubagentCreation:
    """Test that subagents can be created without errors."""

    def test_create_deep_researcher(self):
        """Deep researcher agent can be instantiated."""
        agent = create_deep_researcher()
        assert agent.name == "deep_researcher"
        assert agent.model is not None

    def test_create_monday_checker(self):
        """Monday checker agent can be instantiated."""
        agent = create_monday_checker()
        assert agent.name == "monday_checker"

    def test_create_reconciler(self):
        """Reconciler agent can be instantiated."""
        agent = create_reconciler()
        assert agent.name == "reconciler"
        assert len(agent.tools) == 0  # Pure reasoning, no tools

    def test_create_notion_updater(self):
        """Notion updater agent can be instantiated."""
        agent = create_notion_updater()
        assert agent.name == "notion_updater"


class TestOrchestratorCreation:
    """Test orchestrator creation."""

    def test_create_orchestrator_without_tools(self):
        """Orchestrator can be created without MCP tools."""
        orchestrator = create_contract_intake_orchestrator()
        assert orchestrator.name == "contract_intake_orchestrator"
        assert orchestrator.max_iterations > 0

    def test_orchestrator_has_subagents(self):
        """Orchestrator contains expected subagents."""
        orchestrator = create_contract_intake_orchestrator()
        # LoopAgent wraps a coordinator which has subagents
        assert len(orchestrator.sub_agents) > 0
