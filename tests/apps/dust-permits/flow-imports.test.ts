import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const flowPath = resolve(
  import.meta.dir,
  "../../../apps/dust-permits/src/portal/create/flow.ts"
);
const flowSource = readFileSync(flowPath, "utf8");

describe("portal create flow imports", () => {
  test("uses the app-local dust permit repository module", () => {
    expect(flowSource).toContain(
      'import { getPermitById } from "@dust-permits/db/dust-permit";'
    );
  });
});
