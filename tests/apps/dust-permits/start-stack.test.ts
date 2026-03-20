import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const scriptPath = resolve(
  import.meta.dir,
  "../../../apps/dust-permits/start-stack.sh"
);
const script = readFileSync(scriptPath, "utf8");

describe("start-stack.sh", () => {
  test("polls the Kasm Xvnc pid instead of waiting on a non-child process", () => {
    expect(script).toContain('kill -0 "${VNC_PID}"');
  });
});
