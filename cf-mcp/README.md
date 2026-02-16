# cf-mcp

Cloudflare CLI + MCP server for managing DNS, tunnels, workers, and API tokens.

## Quick Setup

```bash
uvx cf-mcp setup
```

This will walk you through creating a token, verify it, and configure your MCP client(s) automatically.

## Install

```bash
uv tool install cf-mcp
```

Create a token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with permissions for the resources you want to manage (Zone:Read, DNS:Edit, Tunnel:Edit, Workers:Edit, API Tokens:Edit).

## MCP Server

### Claude Code

```bash
claude mcp add cf-mcp \
  -e CF_API_TOKEN=your-token \
  -- cf mcp
```

Or add to `~/.claude.json` manually:

```json
{
  "mcpServers": {
    "cf-mcp": {
      "command": "cf",
      "args": ["mcp"],
      "env": {
        "CF_API_TOKEN": "your-token"
      },
      "type": "stdio"
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "cf-mcp": {
      "command": "cf",
      "args": ["mcp"],
      "env": {
        "CF_API_TOKEN": "your-token"
      }
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.cf-mcp]
command = "cf"
args = ["mcp"]

[mcp_servers.cf-mcp.env]
CF_API_TOKEN = "your-token"
```

### Other MCP Clients

Any MCP client that supports stdio transport can use cf-mcp. Run `cf mcp` as the server command and pass `CF_API_TOKEN` as an environment variable.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CF_API_TOKEN` | Yes | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | No | Account ID (auto-detected if you have one account) |
| `CLOUDFLARE_TUNNEL_ID` | No | Default tunnel ID for ingress commands |

## CLI Usage

```bash
cf zone list
cf dns list example.com
cf dns create example.com app CNAME target.example.com --proxy
cf dns update example.com RECORD_ID --content new-value
cf dns delete example.com RECORD_ID
cf tunnel list
cf tunnel ingress list
cf tunnel ingress add app.example.com http://localhost:3000
cf tunnel ingress remove app.example.com
cf workers list
cf workers info my-worker
cf token verify
cf token list
cf token permissions TOKEN_ID
cf token delete TOKEN_ID
```

All commands support `--json` for machine-readable output.

For CLI usage (not MCP), set environment variables or create a `.env` file:

```bash
export CF_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"  # optional, auto-detected
export CLOUDFLARE_TUNNEL_ID="your-tunnel-id"     # optional
```

## Development

```bash
git clone https://github.com/chikingsley/cf-mcp.git
cd cf-mcp
uv sync
uv run pytest tests/test_output.py -v   # unit tests
uv run pytest -v                         # all tests (requires .env)
uv run ruff check .                      # lint
uv run ty check src/                     # type check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
