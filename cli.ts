import { join } from "node:path";

const repoRoot = import.meta.dir;

function printUsage(): void {
  console.log(`Usage:
  bun run cli <command> [args...]

Commands:
  langextract     Run LangExtract CLI
  pdf-analysis    Run PDF analysis CLI

Examples:
  bun run cli langextract profiles
  bun run cli langextract extract --profile contracts --text-file ./input.txt
  bun run cli pdf-analysis status`);
}

async function runCommand(cmd: string, args: string[]): Promise<number> {
  const shared = ["run"] as const;

  if (cmd === "langextract") {
    const proc = Bun.spawn(
      [
        "uv",
        ...shared,
        "--project",
        join(repoRoot, "packages/documents/langextract"),
        "langextract-cli",
        ...args,
      ],
      {
        cwd: repoRoot,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
      }
    );
    return await proc.exited;
  }

  if (cmd === "pdf-analysis") {
    const proc = Bun.spawn(
      [
        "uv",
        ...shared,
        "--project",
        join(repoRoot, "packages/documents/pdf-analysis-py"),
        "pdf-analysis",
        ...args,
      ],
      {
        cwd: repoRoot,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
      }
    );
    return await proc.exited;
  }

  console.error(`Unknown command: ${cmd}`);
  printUsage();
  return 1;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  const code = await runCommand(command, args);
  process.exit(code);
}

await main();
