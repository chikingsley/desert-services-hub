# Siteline API Complete Reference (Live Introspection)

This file documents where the complete Siteline API definition lives in this repo.

## Canonical Full Schema

- `packages/siteline/src/mcp/reference/siteline-api-introspection.json`
  - Generated from live GraphQL introspection using the configured `SITELINE_API_KEY`.
  - Includes all query roots, all types, enums, inputs, directives, and field arguments.

## Summary (Current Key Scope)

- Query root fields:
  - `currentCompany`
  - `paginatedContracts`
  - `paginatedPayApps`
  - `contract`
  - `payApp`
- Mutation root:
  - `null` (no mutations exposed for this key/scope)

## How To Refresh

Run from repo root:

```bash
cat > /tmp/siteline-introspection.graphql <<'GQL'
query IntrospectionQuery {
  __schema {
    queryType { name fields { name } }
    mutationType { name fields { name } }
    types { kind name description }
  }
}
GQL

bun packages/siteline/cli.ts query --query "$(cat /tmp/siteline-introspection.graphql)" > packages/siteline/src/mcp/reference/siteline-api-introspection.json
```

For a full introspection payload (with all fields/args/inputFields), use the longer query in your shell history from this session.

## Safety

- `siteline_query` MCP tool is read-only by design.
- CLI `query` command is read-only by default. To bypass this, pass `--allow-non-readonly`.
