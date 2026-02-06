/**
 * Shared headless/headed option for CLI commands
 *
 * Provides unified --headless/--headed option handling across all commands.
 */

import type { ArgDef } from "citty";

/**
 * Citty argument definitions for headless/headed options.
 * Use by spreading into your command's args object.
 */
export const headlessArgs = {
  headless: {
    type: "boolean" as const,
    description: "Run browser in headless mode",
  },
  headed: {
    type: "boolean" as const,
    description: "Run browser with visible UI (overrides --headless)",
  },
} satisfies Record<string, ArgDef>;

/**
 * Resolve the effective headless setting from CLI args.
 *
 * Priority order:
 * 1. --headed flag (explicitly false)
 * 2. --headless flag (explicitly true)
 * 3. undefined (let config decide)
 *
 * @param args - Parsed CLI arguments containing headless/headed flags
 * @returns true for headless, false for headed, undefined for config default
 */
export function resolveHeadless(args: {
  headless?: boolean;
  headed?: boolean;
}): boolean | undefined {
  // --headed takes precedence (user explicitly wants to see browser)
  if (args.headed === true) {
    return false;
  }

  // --headless flag
  if (args.headless === true) {
    return true;
  }

  // Let config/env decide
  return undefined;
}

/**
 * Parse headless override from raw argv array.
 * Use this for standalone scripts that don't use citty.
 *
 * @param args - Raw command line arguments (e.g., process.argv.slice(2))
 * @returns Object with headlessOverride and remaining args
 */
export function parseHeadlessOverride(args: string[]): {
  headlessOverride?: boolean;
  rest: string[];
} {
  let headlessOverride: boolean | undefined;
  const rest: string[] = [];

  for (const arg of args) {
    if (arg === "--headless") {
      headlessOverride = true;
      continue;
    }
    if (arg === "--headed") {
      headlessOverride = false;
      continue;
    }
    if (arg.startsWith("--headless=")) {
      const value = arg.split("=", 2)[1];
      if (value === "true") {
        headlessOverride = true;
        continue;
      }
      if (value === "false") {
        headlessOverride = false;
        continue;
      }
    }
    rest.push(arg);
  }

  return { headlessOverride, rest };
}
