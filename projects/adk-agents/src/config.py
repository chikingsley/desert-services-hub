"""Configuration for ADK agents."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Google AI
    google_api_key: str = ""

    # Model settings
    default_model: str = "gemini-3-flash-preview"
    orchestrator_model: str = "gemini-3-flash-preview"

    # MCP Server endpoints (for connecting to existing MCPs)
    # These paths are relative to workbench_path
    email_mcp_command: str = "bun"
    email_mcp_args: list[str] = ["./services/email/mcp-server.ts"]

    monday_mcp_command: str = "bun"
    monday_mcp_args: list[str] = ["./services/monday/mcp-server.ts"]

    # Notion MCP (uses our local desert-notion server)
    notion_mcp_command: str = "bun"
    notion_mcp_args: list[str] = ["./services/notion/mcp-server.ts"]

    # Workbench path - where MCP servers live
    # Override with WORKBENCH_PATH env var for local dev
    workbench_path: str = "/Users/chiejimofor/Documents/Github/ds-workbench"

    # Agent settings
    max_loop_iterations: int = 10
    debug: bool = False


settings = Settings()
