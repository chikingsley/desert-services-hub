#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { SitelineClient } from "./src/client";

function showHelp(): void {
  console.log(`
Siteline CLI

Usage:
  bun packages/siteline/cli.ts current-company
  bun packages/siteline/cli.ts list-contracts [--limit 20] [--search "text"]
  bun packages/siteline/cli.ts get-contract --id "<contract-id>"
  bun packages/siteline/cli.ts list-pay-apps [--limit 20] [--status PROPOSED]
  bun packages/siteline/cli.ts get-pay-app --id "<pay-app-id>"
  bun packages/siteline/cli.ts query --query "<graphql>" [--vars '{"key":"value"}'] [--allow-non-readonly]

Environment:
  SITELINE_API_KEY (required)
  SITELINE_API_URL (optional, default https://api-external.siteline.com/graphql)
`);
}

function parseJsonVars(
  value: string | undefined
): Record<string, unknown> | undefined {
  return value ? (JSON.parse(value) as Record<string, unknown>) : undefined;
}

async function handleCurrentCompany(client: SitelineClient): Promise<void> {
  const result = await client.currentCompany();
  console.log(JSON.stringify(result, null, 2));
}

async function handleQuery(
  client: SitelineClient,
  args: string[]
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      "allow-non-readonly": { type: "boolean", default: false },
      query: { type: "string", short: "q" },
      vars: { type: "string", short: "v" },
    },
  });

  const query = values.query;
  if (!query) {
    throw new Error("Missing --query for `query` command.");
  }

  const variables = parseJsonVars(values.vars);
  const result = values["allow-non-readonly"]
    ? await client.query(query, variables)
    : await client.queryReadOnly(query, variables);
  console.log(JSON.stringify(result, null, 2));
}

async function handleListContracts(
  client: SitelineClient,
  args: string[]
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      "contract-status": { type: "string" },
      cursor: { type: "string" },
      limit: { type: "string" },
      month: { type: "string" },
      "pay-app-status": { type: "string" },
      search: { type: "string" },
    },
  });

  const result = await client.paginatedContracts({
    contractStatus: values["contract-status"] ?? undefined,
    cursor: values.cursor ?? undefined,
    limit: values.limit ? Number.parseInt(values.limit, 10) : undefined,
    month: values.month ?? undefined,
    payAppStatus: values["pay-app-status"] ?? undefined,
    search: values.search ?? undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}

function parseRequiredId(rawId: unknown, command: string): string {
  if (typeof rawId !== "string" || !rawId.trim()) {
    throw new Error(`Missing --id for \`${command}\` command.`);
  }
  return rawId;
}

async function handleGetContract(
  client: SitelineClient,
  args: string[]
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      id: { type: "string" },
    },
  });
  const id = parseRequiredId(values.id, "get-contract");
  const result = await client.contract(id);
  console.log(JSON.stringify(result, null, 2));
}

async function handleListPayApps(
  client: SitelineClient,
  args: string[]
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      cursor: { type: "string" },
      limit: { type: "string" },
      "paid-in-month": { type: "string" },
      status: { type: "string" },
      "submitted-in-month": { type: "string" },
    },
  });

  const result = await client.paginatedPayApps({
    cursor: values.cursor ?? undefined,
    limit: values.limit ? Number.parseInt(values.limit, 10) : undefined,
    paidInMonth: values["paid-in-month"] ?? undefined,
    status: values.status ?? undefined,
    submittedInMonth: values["submitted-in-month"] ?? undefined,
  });
  console.log(JSON.stringify(result, null, 2));
}

async function handleGetPayApp(
  client: SitelineClient,
  args: string[]
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      id: { type: "string" },
    },
  });
  const id = parseRequiredId(values.id, "get-pay-app");
  const result = await client.payApp(id);
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  const client = new SitelineClient();

  switch (command) {
    case "current-company":
      await handleCurrentCompany(client);
      return;
    case "query":
      await handleQuery(client, rest);
      return;
    case "list-contracts":
      await handleListContracts(client, rest);
      return;
    case "get-contract":
      await handleGetContract(client, rest);
      return;
    case "list-pay-apps":
      await handleListPayApps(client, rest);
      return;
    case "get-pay-app":
      await handleGetPayApp(client, rest);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

await main();
