import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MONEY_RE = /^[\s$]*([\d,]+\.\d{2})T?\s*$/;

export function resolvePath(path: string): string {
  return resolve(path);
}

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function die(message: string): never {
  console.error(message);
  process.exit(1);
}

export function parseMoney(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = decodeCidGlyphs(value).trim();
  const match = normalized.match(MONEY_RE);
  if (!match?.[1]) {
    return null;
  }
  return Number.parseFloat(match[1].replaceAll(",", ""));
}

export function parseQty(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = decodeCidGlyphs(value).trim().replaceAll(",", "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function decodeCidGlyphs(value: string): string {
  return value.replace(/\(cid:(\d+)\)/g, (_m, digits: string) => {
    const code = Number.parseInt(digits, 10);
    if (code >= 32 && code <= 126) {
      return String.fromCharCode(code);
    }
    return "";
  });
}

export function normalizeCell(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return decodeCidGlyphs(value).replaceAll("\r\n", "\n").trim();
}

export function asJson<T>(value: T): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
