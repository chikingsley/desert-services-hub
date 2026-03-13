import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const composePath = resolve(import.meta.dir, "../../docker-compose.yml");
const compose = readFileSync(composePath, "utf8");

describe("webhook-gateway docker healthcheck", () => {
  test("treats the gateway's expected 404 root response as healthy", () => {
    expect(compose).toContain("webhook-gateway:");
    expect(compose).toContain(
      'test: ["CMD-SHELL", "status=$(wget -S -O /dev/null http://127.0.0.1/ 2>&1 | awk \'/^  HTTP\\\\/1.1/{print $2}\' | tail -n1); [ \\"$$status\\" = \\"200\\" ] || [ \\"$$status\\" = \\"404\\" ]"]'
    );
  });
});
