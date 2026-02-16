# cf-mcp

Cloudflare CLI + MCP server. Python, managed with `uv`.

## Commits

All commits MUST use [Conventional Commits](https://www.conventionalcommits.org/) format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). release-please reads these to auto-bump versions: `feat:` → minor, `fix:` → patch, `feat!:` → major. Keep subject under 72 chars.

## Commands

```bash
uv run ruff format .          # format
uv run ruff check --fix .     # lint
uv run ty check src/          # type check
uv run pytest tests/test_output.py -v   # unit tests (always safe)
uv run pytest -v              # all tests (needs .env with live credentials)
```

All four checks (format, lint, type, unit tests) must pass before committing.

## Environment

Requires `.env` in project root (gitignored):

```text
CF_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...   # optional, auto-detected from API
CLOUDFLARE_TUNNEL_ID=...    # optional, default for ingress commands
CF_TEST_ZONE=your-zone.com  # needed for DNS integration tests
```

## Project Structure

```text
src/cf_mcp/
├── cli.py            # Typer app — CLI entry point, subcommands
├── client.py         # httpx async Cloudflare API client
├── config.py         # Pydantic Settings (env vars + .env)
├── output.py         # Table/JSON formatting for CLI output
├── server.py         # FastMCP server — exposes commands as MCP tools
└── commands/         # Shared logic (used by both CLI and MCP)
    ├── dns.py        # DNS record CRUD
    ├── tunnels.py    # Tunnel list, ingress management
    ├── workers.py    # Worker scripts list/info
    ├── tokens.py     # API token management
    └── zones.py      # Zone listing
tests/
├── test_output.py    # Unit tests (run in CI)
├── test_setup.py     # Unit + integration tests for setup wizard (run in CI, -k "not live")
├── test_dns.py       # Integration (needs .env + CF_TEST_ZONE)
├── test_zones.py     # Integration
├── test_tunnels.py   # Integration
├── test_tokens.py    # Integration
├── test_workers.py   # Integration
└── conftest.py       # Fixtures, .env loading
```

## Architecture

- **Commands** in `commands/` are async functions returning dicts/lists. No printing, no formatting — pure data.
- **CLI** (`cli.py`) calls commands via `_run_with_client()` helper and formats output with `output.py`.
- **MCP server** (`server.py`) calls the same commands and returns data directly.
- **Client** (`client.py`) wraps httpx with auth, error handling, pagination. Use `async with CloudflareClient(settings) as client:`.
- **Config** (`config.py`) uses Pydantic Settings. Reads from env vars and `.env` file.
- **Account ID** is auto-detected via `client.resolve_account_id()` — calls `GET /accounts` and caches. Only fails if multiple accounts exist without `CLOUDFLARE_ACCOUNT_ID` set.

## Adding a Command

1. Add async function to the relevant `commands/*.py` module (or create new one)
2. Wire into `cli.py` as a typer subcommand under the appropriate sub-app
3. Wire into `server.py` as a `@mcp.tool()` function
4. Add tests in `tests/`
5. Run all checks before committing

## Key Patterns

- Decorators on typer commands must use `@functools.wraps` to preserve signatures
- `_run_with_client(lambda client, settings: ...)` handles async-to-sync bridge for CLI
- `_handle_errors` decorator wraps CLI commands with CloudflareError/ValueError handling
- Zone names are resolved to IDs via `client.resolve_zone_id()` (cached per session)
- Account ID resolved via `client.resolve_account_id()` (settings → API fallback, cached)
- `client.get()` returns `dict[str, Any]` for single resources; `client.get_paginated()` returns `list[Any]` for list endpoints
- Integration tests skip when `.env` is missing (no failure in CI)
- DNS tests require `CF_TEST_ZONE` env var set to a zone name in the account
- No `print()` in `commands/` modules — return data, let CLI/MCP format it
- No Cloudflare credentials in CI or any tracked file

## Related

- **`cloudflare` skill** — documents all `cf` CLI commands, zones, tunnel ingress, and common patterns for Claude Code sessions
