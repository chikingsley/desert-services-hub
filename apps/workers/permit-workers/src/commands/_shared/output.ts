/**
 * Shared output formatters for CLI commands
 *
 * Provides consistent JSON and human-readable output across all commands.
 */

import type { ArgDef } from "citty";

/**
 * Citty argument definitions for output format options.
 * Use by spreading into your command's args object.
 */
export const outputArgs = {
  json: {
    type: "boolean" as const,
    description: "Output as JSON (for machine consumption)",
    default: false,
  },
} satisfies Record<string, ArgDef>;

/**
 * Result type for command outputs
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Output result to console in appropriate format.
 *
 * @param result - The result to output
 * @param args - CLI args with json flag
 */
export function outputResult<T>(
  result: CommandResult<T>,
  args: { json?: boolean }
): void {
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.success) {
    if (result.data) {
      console.log(result.data);
    }
  } else {
    console.error(`Error: ${result.error}`);
  }
}

/**
 * Format a table for console output
 */
export function formatTable(
  rows: Record<string, unknown>[],
  columns?: string[]
): string {
  if (rows.length === 0) {
    return "(no data)";
  }

  const cols = columns ?? Object.keys(rows[0] ?? {});
  const widths = cols.map((col) =>
    Math.max(col.length, ...rows.map((row) => String(row[col] ?? "").length))
  );

  const header = cols.map((col, i) => col.padEnd(widths[i] ?? 0)).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");
  const dataRows = rows.map((row) =>
    cols
      .map((col, i) => String(row[col] ?? "").padEnd(widths[i] ?? 0))
      .join(" | ")
  );

  return [header, separator, ...dataRows].join("\n");
}
