import { existsSync, readFileSync } from "node:fs";
import { pythonExtension } from "@trigger.dev/python/extension";
import { defineConfig } from "@trigger.dev/sdk";

const DOCUMENT_INTAKE_DIR = "./apps/trigger-dev/src/document-intake";
const DOCUMENT_INTAKE_REQUIREMENTS = `${DOCUMENT_INTAKE_DIR}/requirements.txt`;
const DOCUMENT_INTAKE_VENV_PYTHON = `${DOCUMENT_INTAKE_DIR}/.venv/bin/python`;

function loadPythonRequirements(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

const documentIntakeRequirements = loadPythonRequirements(
  DOCUMENT_INTAKE_REQUIREMENTS
);
const devPythonBinaryPath =
  process.env.TRIGGER_DEV_PYTHON_BIN_PATH ??
  (existsSync(DOCUMENT_INTAKE_VENV_PYTHON)
    ? DOCUMENT_INTAKE_VENV_PYTHON
    : undefined);

export default defineConfig({
  project: "proj_wkzoqdssbjqgovmwhvjq",
  runtime: "node",
  maxDuration: 7200,
  dirs: ["./apps/trigger-dev/src/trigger"],
  build: {
    extensions: [
      pythonExtension({
        scripts: [`${DOCUMENT_INTAKE_DIR}/**/*.py`],
        requirements: documentIntakeRequirements,
        devPythonBinaryPath,
      }),
    ],
  },
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
});
