# Changelog

## [0.1.1](https://github.com/chikingsley/cf-mcp/compare/v0.1.0...v0.1.1) (2026-02-16)

### Bug Fixes

* add contents:read permission to publish job ([10decb6](https://github.com/chikingsley/cf-mcp/commit/10decb619dbf7e03454fa89e3029141aedf48c12))

## 0.1.0 (2026-02-16)

### Features

* add release-please auto-versioning and make tests agnostic ([fbb00b9](https://github.com/chikingsley/cf-mcp/commit/fbb00b9b83f66ac9f70a8357beb025358354702d))
* initial cf-mcp CLI + MCP server for Cloudflare management ([e7faa0b](https://github.com/chikingsley/cf-mcp/commit/e7faa0bd0b5218b7c44caaa09da82c0cbfdcfeb4))

### Documentation

* add CLAUDE.md with project conventions and commit guidelines ([ef82590](https://github.com/chikingsley/cf-mcp/commit/ef8259042419814e49e210cae6a46d0924fb5678))

## 0.1.0 (2026-02-16)

Initial release.

### Features

- CLI tool (`cf`) with subcommands for zones, DNS, tunnels, workers, and tokens
- MCP server (`cf mcp`) exposing all operations as tools via FastMCP
- Async Cloudflare API client with pagination, zone name resolution, and error handling
- `--json` flag on all commands for machine-readable output
- Tunnel ingress management (add/remove rules)
- API token management (verify, list, permissions, delete)
- Pydantic Settings config from environment variables and `.env` files
