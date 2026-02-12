import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function resolvePath(path: string): string {
  return resolve(path);
}

export function die(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
}
