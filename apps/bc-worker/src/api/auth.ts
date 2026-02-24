// BuildingConnected auth process control and VNC clipboard bridge.
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { bcSession } from "../lib/browser";

const LOG = "[bc-worker-auth-api]";
const DEFAULT_START_URL = "https://app.buildingconnected.com/";
const DEFAULT_STATE_PATH = "/app/data/attachments/body-links-auth/state.json";
const DEFAULT_MANUAL_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_DISPLAY = ":1";
const DEFAULT_RESOLUTION_WIDTH = 1920;
const DEFAULT_RESOLUTION_HEIGHT = 1080;
const DISPLAY_COMMAND_TIMEOUT_MS = 10_000;
const CLIPBOARD_COPY_SETTLE_MS = 150;
const MAX_LOG_LINES = 200;
const VNC_RESOLUTION_PATTERN = /^(\d{2,5})x(\d{2,5})$/i;

const STATE_PATH =
  process.env.EMAIL_BODY_LINK_PLAYWRIGHT_STORAGE_STATE_PATH?.trim() ||
  DEFAULT_STATE_PATH;

interface StateFileMetadata {
  exists: boolean;
  lastModifiedAt: string | null;
  size: number | null;
}

interface BootstrapRunState {
  finishedAt: string | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastValidateUrl: string | null;
  logTail: string[];
  pid: number | null;
  running: boolean;
  startedAt: string | null;
}

export interface BuildingConnectedAuthStatusResponse {
  finishedAt: string | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastValidateUrl: string | null;
  logTail: string[];
  manualAuthTimeoutMs: number;
  pid: number | null;
  running: boolean;
  session: import("@/lib/browser-session").SessionStatus;
  startedAt: string | null;
  startUrl: string;
  stateExists: boolean;
  stateFileSize: number | null;
  stateLastModifiedAt: string | null;
  statePath: string;
  viewportHeight: number;
  viewportWidth: number;
}

export interface BuildingConnectedAuthStartOptions {
  manualAuthTimeoutMs: number;
  startUrl: string;
  validateUrl: string | null;
}

const runState: BootstrapRunState = {
  finishedAt: null,
  lastError: null,
  lastExitCode: null,
  lastSignal: null,
  lastValidateUrl: null,
  logTail: [],
  pid: null,
  running: false,
  startedAt: null,
};

let activeProcess: ChildProcessWithoutNullStreams | null = null;

interface DisplayCommandResult {
  code: number | null;
  signal: string | null;
  stderr: string;
  stdout: string;
}

function pushLog(chunk: string): void {
  const lines = chunk
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return;
  }

  runState.logTail.push(...lines);
  if (runState.logTail.length > MAX_LOG_LINES) {
    runState.logTail.splice(0, runState.logTail.length - MAX_LOG_LINES);
  }
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const parsed =
    typeof raw === "number"
      ? raw
      : Number.parseInt(typeof raw === "string" ? raw : "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function parseOptionalString(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

function getDefaultStartUrl(): string {
  return (
    process.env.BUILDINGCONNECTED_LOGIN_START_URL?.trim() || DEFAULT_START_URL
  );
}

function getDefaultManualAuthTimeoutMs(): number {
  return parsePositiveInt(
    process.env.BUILDINGCONNECTED_AUTH_MANUAL_TIMEOUT_MS,
    DEFAULT_MANUAL_TIMEOUT_MS
  );
}

function getDisplay(): string {
  return process.env.DISPLAY?.trim() || DEFAULT_DISPLAY;
}

export function parseBuildingConnectedVncResolution(raw: string | undefined): {
  height: number;
  width: number;
} {
  const value = raw?.trim();
  const match = value?.match(VNC_RESOLUTION_PATTERN);
  if (!match) {
    return {
      height: DEFAULT_RESOLUTION_HEIGHT,
      width: DEFAULT_RESOLUTION_WIDTH,
    };
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!(width > 0 && height > 0)) {
    return {
      height: DEFAULT_RESOLUTION_HEIGHT,
      width: DEFAULT_RESOLUTION_WIDTH,
    };
  }

  return { height, width };
}

export function normalizeBuildingConnectedClipboardPasteRequest(
  raw: unknown
): string {
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return typeof body.text === "string" ? body.text : "";
}

export function normalizeBuildingConnectedAuthStartRequest(
  raw: unknown
): BuildingConnectedAuthStartOptions {
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    manualAuthTimeoutMs: parsePositiveInt(
      body.manualAuthTimeoutMs,
      getDefaultManualAuthTimeoutMs()
    ),
    startUrl: parseOptionalString(body.startUrl) || getDefaultStartUrl(),
    validateUrl: parseOptionalString(body.validateUrl),
  };
}

async function readStateFileMetadata(): Promise<StateFileMetadata> {
  try {
    const details = await stat(STATE_PATH);
    if (!details.isFile()) {
      return {
        exists: false,
        lastModifiedAt: null,
        size: null,
      };
    }
    return {
      exists: true,
      lastModifiedAt: details.mtime.toISOString(),
      size: details.size,
    };
  } catch {
    return {
      exists: false,
      lastModifiedAt: null,
      size: null,
    };
  }
}

async function getStatusPayload(
  currentOptions?: BuildingConnectedAuthStartOptions
): Promise<BuildingConnectedAuthStatusResponse> {
  const viewport = parseBuildingConnectedVncResolution(
    process.env.VNC_RESOLUTION
  );
  const stateFile = await readStateFileMetadata();
  const session = bcSession.getStatus();
  return {
    finishedAt: runState.finishedAt,
    lastError: session.lastError ?? runState.lastError,
    lastExitCode: runState.lastExitCode,
    lastSignal: runState.lastSignal,
    lastValidateUrl: runState.lastValidateUrl,
    logTail: [...runState.logTail],
    manualAuthTimeoutMs:
      currentOptions?.manualAuthTimeoutMs ?? getDefaultManualAuthTimeoutMs(),
    pid: runState.pid,
    running: runState.running,
    session,
    startUrl: currentOptions?.startUrl ?? getDefaultStartUrl(),
    startedAt: runState.startedAt,
    stateExists: stateFile.exists,
    stateFileSize: stateFile.size,
    stateLastModifiedAt: stateFile.lastModifiedAt,
    statePath: STATE_PATH,
    viewportHeight: viewport.height,
    viewportWidth: viewport.width,
  };
}

function buildBootstrapArgs(
  options: BuildingConnectedAuthStartOptions
): string[] {
  const args = [
    "packages/email/cli/cli.ts",
    "body-link-auth-bootstrap",
    "--headed",
    "--non-interactive",
    "--manual-auth-wait",
    `--manual-timeout-ms=${options.manualAuthTimeoutMs}`,
    "--state-path",
    STATE_PATH,
    "--url",
    options.startUrl,
  ];

  if (options.validateUrl) {
    args.push("--validate-url", options.validateUrl);
  }

  return args;
}

function markRunStarted(options: BuildingConnectedAuthStartOptions): void {
  runState.running = true;
  runState.startedAt = new Date().toISOString();
  runState.finishedAt = null;
  runState.lastExitCode = null;
  runState.lastSignal = null;
  runState.lastError = null;
  runState.lastValidateUrl = options.validateUrl;
  runState.logTail = [];
}

function markRunFinished(code: number | null, signal: string | null): void {
  runState.running = false;
  runState.finishedAt = new Date().toISOString();
  runState.lastExitCode = code;
  runState.lastSignal = signal;
  runState.pid = null;
  activeProcess = null;

  if (code !== 0 && !runState.lastError) {
    runState.lastError = `Auth bootstrap exited with code ${code ?? "unknown"}`;
  }

  // Bootstrap saved storageState — reload the persistent session
  if (code === 0) {
    bcSession.reloadStateFromDisk().catch((error) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `[bc-auth] Failed to reload session after bootstrap: ${msg}`
      );
    });
  }
}

function startBootstrapProcess(
  options: BuildingConnectedAuthStartOptions
): void {
  if (activeProcess && runState.running) {
    throw new Error("BuildingConnected auth bootstrap is already running");
  }

  markRunStarted(options);
  const args = buildBootstrapArgs(options);
  console.log(`${LOG} starting bootstrap: bun ${args.join(" ")}`);

  const child = spawn("bun", args, {
    cwd: "/app",
    env: {
      ...process.env,
      EMAIL_BODY_LINK_PLAYWRIGHT_HEADLESS: "0",
    },
    stdio: "pipe",
  });

  activeProcess = child;
  runState.pid = child.pid ?? null;

  child.stdout.on("data", (buffer: Buffer) => {
    const message = buffer.toString("utf8");
    pushLog(message);
    process.stdout.write(message);
  });

  child.stderr.on("data", (buffer: Buffer) => {
    const message = buffer.toString("utf8");
    pushLog(message);
    const trimmed = message.trim();
    if (trimmed.length) {
      runState.lastError = trimmed;
    }
    process.stderr.write(message);
  });

  child.once("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    runState.lastError = message;
    console.error(`${LOG} failed to start bootstrap: ${message}`);
    markRunFinished(null, null);
  });

  child.once("exit", (code, signal) => {
    console.log(
      `${LOG} bootstrap exited: code=${code ?? "null"} signal=${signal ?? "null"}`
    );
    markRunFinished(code, signal);
  });
}

function stopBootstrapProcess(): boolean {
  if (!(activeProcess && runState.running)) {
    return false;
  }

  runState.lastError = "Stopped by operator";
  return activeProcess.kill("SIGINT");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runDisplayCommand(
  command: string,
  args: string[],
  options?: {
    inputText?: string;
    timeoutMs?: number;
  }
): Promise<DisplayCommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        DISPLAY: getDisplay(),
      },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeoutMs = options?.timeoutMs ?? DISPLAY_COMMAND_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (buffer: Buffer) => {
      stdout += buffer.toString("utf8");
    });

    child.stderr.on("data", (buffer: Buffer) => {
      stderr += buffer.toString("utf8");
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            `${command} timed out after ${timeoutMs}ms (${args.join(" ")})`
          )
        );
        return;
      }
      resolve({
        code,
        signal,
        stderr,
        stdout,
      });
    });

    if (options?.inputText !== undefined) {
      child.stdin.write(options.inputText);
    }
    child.stdin.end();
  });
}

function summarizeDisplayFailure(
  command: string,
  result: DisplayCommandResult
): string {
  const trimmedError = result.stderr.trim();
  const detail = trimmedError || result.stdout.trim() || "no output";
  return `${command} failed (code=${result.code ?? "null"}, signal=${result.signal ?? "null"}): ${detail}`;
}

async function focusChromiumWindow(): Promise<void> {
  await runDisplayCommand("xdotool", [
    "search",
    "--onlyvisible",
    "--class",
    "chromium",
    "windowfocus",
    "--sync",
  ]).catch(() => {
    // Non-fatal: if search fails we fall through to the key event anyway.
  });
}

async function pasteToActiveVncWindow(text: string): Promise<void> {
  const writeClipboardResult = await runDisplayCommand(
    "xclip",
    ["-selection", "clipboard", "-in"],
    { inputText: text }
  );
  if (writeClipboardResult.code !== 0) {
    throw new Error(
      summarizeDisplayFailure("xclip write", writeClipboardResult)
    );
  }

  await focusChromiumWindow();

  const ctrlVResult = await runDisplayCommand("xdotool", [
    "key",
    "--clearmodifiers",
    "ctrl+v",
  ]);
  if (ctrlVResult.code === 0) {
    return;
  }

  const shiftInsertResult = await runDisplayCommand("xdotool", [
    "key",
    "--clearmodifiers",
    "Shift+Insert",
  ]);
  if (shiftInsertResult.code !== 0) {
    throw new Error(
      summarizeDisplayFailure("xdotool paste", shiftInsertResult)
    );
  }
}

async function copyFromActiveVncWindow(): Promise<string> {
  const copyKeyResult = await runDisplayCommand("xdotool", [
    "key",
    "--clearmodifiers",
    "ctrl+c",
  ]);
  if (copyKeyResult.code !== 0) {
    throw new Error(summarizeDisplayFailure("xdotool copy", copyKeyResult));
  }

  await new Promise((resolve) => setTimeout(resolve, CLIPBOARD_COPY_SETTLE_MS));

  const readClipboardResult = await runDisplayCommand("xclip", [
    "-selection",
    "clipboard",
    "-out",
  ]);
  if (readClipboardResult.code !== 0) {
    throw new Error(summarizeDisplayFailure("xclip read", readClipboardResult));
  }

  return readClipboardResult.stdout;
}

function runningConflictResponse(message: string): Response {
  return Response.json(
    {
      error: message,
      success: false,
      timestamp: new Date().toISOString(),
    },
    { status: 409 }
  );
}

export async function handleBuildingConnectedAuthStatus(): Promise<Response> {
  return Response.json(await getStatusPayload());
}

export async function handleBuildingConnectedAuthStart(
  req: Request
): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    const options = normalizeBuildingConnectedAuthStartRequest(body);
    startBootstrapProcess(options);
    return Response.json(
      {
        queued: true,
        success: true,
        timestamp: new Date().toISOString(),
        ...(await getStatusPayload(options)),
      },
      { status: 202 }
    );
  } catch (error) {
    const message = getErrorMessage(error);
    const conflict = message.includes("already running");
    return Response.json(
      {
        error: message,
        success: false,
        timestamp: new Date().toISOString(),
        ...(await getStatusPayload()),
      },
      { status: conflict ? 409 : 500 }
    );
  }
}

export async function handleBuildingConnectedAuthStop(): Promise<Response> {
  const stopped = stopBootstrapProcess();
  return Response.json(
    {
      stopped,
      success: true,
      timestamp: new Date().toISOString(),
      ...(await getStatusPayload()),
    },
    { status: stopped ? 200 : 409 }
  );
}

export async function handleBuildingConnectedAuthClipboardPaste(
  req: Request
): Promise<Response> {
  if (!(runState.running || bcSession.getStatus().active)) {
    return runningConflictResponse(
      "BuildingConnected auth session is not running"
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    const text = normalizeBuildingConnectedClipboardPasteRequest(body);
    if (!text.length) {
      return Response.json(
        {
          error: "Clipboard text is required",
          success: false,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    await pasteToActiveVncWindow(text);
    return Response.json({
      inserted: true,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
        inserted: false,
        success: false,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function handleBuildingConnectedAuthClipboardCopy(): Promise<Response> {
  if (!(runState.running || bcSession.getStatus().active)) {
    return runningConflictResponse(
      "BuildingConnected auth session is not running"
    );
  }

  try {
    const text = await copyFromActiveVncWindow();
    return Response.json({
      success: true,
      text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
        success: false,
        text: "",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
