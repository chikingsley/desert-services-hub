# Contributing

## Setup

```bash
git clone https://github.com/chikingsley/cf-mcp.git
cd cf-mcp
uv sync
```

Create a `.env` file with your Cloudflare credentials for integration tests:

```text
CF_API_TOKEN=your-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_TUNNEL_ID=your-tunnel-id
CF_TEST_ZONE=your-zone.com
```

## Development

```bash
uv run ruff format .          # Format
uv run ruff check --fix .     # Lint
uv run ty check src/          # Type check
uv run pytest tests/test_output.py -v    # Unit tests (no credentials needed)
uv run pytest -v              # All tests (requires .env with live credentials)
```

All checks must pass before submitting a PR. CI runs unit tests, linting, and type checking automatically.

## Tests

- **Unit tests** (`tests/test_output.py`) — run in CI, no credentials needed.
- **Integration tests** — run against the live Cloudflare API. Require a `.env` file with valid credentials. These skip automatically if `.env` is missing.

Integration tests are account-agnostic: they don't hardcode zone names or resource counts. Set `CF_TEST_ZONE` to any zone in your account for DNS tests.

## Adding a New Command

1. Create or edit a module in `src/cf_mcp/commands/`
2. Wire it into `src/cf_mcp/cli.py` (typer subcommand)
3. Wire it into `src/cf_mcp/server.py` (MCP tool)
4. Add tests in `tests/`
5. Run all checks: `uv run ruff format . && uv run ruff check . && uv run ty check src/ && uv run pytest -v`

## Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please). When you merge commits to `main` using [conventional commit](https://www.conventionalcommits.org/) messages, release-please:

1. Opens (or updates) a release PR that bumps the version and updates `CHANGELOG.md`
2. When you merge the release PR, it creates a GitHub release and tag
3. The publish job automatically builds and uploads to PyPI

Commit message prefixes:
- `feat:` — bumps minor version (0.1.0 → 0.2.0)
- `fix:` — bumps patch version (0.1.0 → 0.1.1)
- `feat!:` or `BREAKING CHANGE:` — bumps major version (0.1.0 → 1.0.0)
- `chore:`, `docs:`, `refactor:` — no version bump
