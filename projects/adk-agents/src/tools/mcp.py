"""MCP server integration for ADK agents."""

from google.adk.tools.mcp_tool import McpToolset, StdioConnectionParams
from mcp import StdioServerParameters

from src.config import settings


def _stdio_toolset(command: str, args: list[str], timeout: float = 180.0) -> McpToolset:
    """Create a stdio-based MCP toolset.

    Args:
        command: Command to run the MCP server
        args: Arguments for the command
        timeout: Timeout in seconds for both connection and read operations.
                 Default is 180s since MCP operations may call external APIs
                 and multiple tools may be called in parallel.
    """
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=command,
                args=args,
                cwd=settings.workbench_path,
            ),
            timeout=timeout,
        )
    )


async def get_email_tools() -> list:
    """Get email tools from desert-email MCP server via stdio."""
    return await _stdio_toolset(settings.email_mcp_command, settings.email_mcp_args).get_tools()


async def get_monday_tools() -> list:
    """Get Monday.com tools from desert-mondaycrm MCP server via stdio."""
    return await _stdio_toolset(settings.monday_mcp_command, settings.monday_mcp_args).get_tools()


async def get_notion_tools() -> list:
    """Get Notion tools from desert-notion MCP server via stdio."""
    return await _stdio_toolset(settings.notion_mcp_command, settings.notion_mcp_args).get_tools()
