import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { z } from "zod";

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function resolvePath(path: string): string {
  return resolve(path);
}

export function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
