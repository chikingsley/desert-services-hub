/**
 * Automation portal page
 *
 * Embedded VNC views for Maricopa portal automation and BuildingConnected auth bootstrap.
 * Uses @simonpeacocks/react-vnc for direct WebSocket VNC connections (no iframe).
 */

// biome-ignore lint/nursery/noExcessiveLinesPerFile: Maricopa and BuildingConnected views intentionally share one automation shell.
import { CheckCircle2, Loader2, Play, RefreshCw, Square } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import useSWR from "swr";
import { CheckpointBanner } from "@/apps/web/frontend/components/checkpoint-banner";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  VncPanel,
  type VncPanelHandle,
} from "@/apps/web/frontend/components/vnc-panel";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface AutomationStatus {
  active: boolean;
  busy: boolean;
  currentOperation: string | null;
  isLoggedIn: boolean;
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  lastActivityAt: string | null;
  lastError: string | null;
  lastKeepAliveAt: string | null;
  lastLoginAt: string | null;
  lastPortalPinAt?: string | null;
  portalHomePinEnabled?: boolean;
  portalHomePinIntervalMs?: number;
  portalReady: boolean;
  startedAt: string | null;
  viewportHeight: number;
  viewportWidth: number;
  vncUrl: string;
  vncWsUrl: string;
}

interface BuildingConnectedAuthStatus {
  finishedAt: string | null;
  lastError: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastValidateUrl: string | null;
  logTail: string[];
  manualAuthTimeoutMs: number;
  pid: number | null;
  running: boolean;
  startedAt: string | null;
  startUrl: string;
  stateExists: boolean;
  stateFileSize: number | null;
  stateLastModifiedAt: string | null;
  statePath: string;
  viewportHeight: number;
  viewportWidth: number;
  vncWsUrl: string;
}

type AutomationActionEndpoint =
  | "/api/automation/start"
  | "/api/automation/ready"
  | "/api/automation/keepalive"
  | "/api/automation/stop";

type BuildingConnectedActionEndpoint =
  | "/api/buildingconnected/auth/start"
  | "/api/buildingconnected/auth/stop";

interface RunActionOptions {
  body?: unknown;
  silentSuccess?: boolean;
}

interface AutomationActionPayload {
  error?: string;
  success?: boolean;
}

type AutomationPortal = "maricopa" | "buildingconnected";

function getPortalFromPath(pathname: string): AutomationPortal {
  if (pathname === "/buildingconnected") {
    return "buildingconnected";
  }
  return "maricopa";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "\u2014";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatByteSize(value: number | null): string {
  if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    return "\u2014";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function getWsFallbackUrl(port: number): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${port}`;
}

function getSessionDisplay(data: AutomationStatus | undefined): {
  label: string;
  dotClass: string;
} {
  if (!data) {
    return { label: "Checking", dotClass: "bg-red-500" };
  }
  if (data.portalReady) {
    return { label: "Ready", dotClass: "bg-green-500" };
  }
  if (data.active) {
    return { label: "Login Needed", dotClass: "bg-amber-500" };
  }
  return { label: "Offline", dotClass: "bg-red-500" };
}

function getBuildingConnectedSessionDisplay(
  data: BuildingConnectedAuthStatus | undefined
): {
  label: string;
  dotClass: string;
} {
  if (!data) {
    return { label: "Checking", dotClass: "bg-red-500" };
  }
  if (data.running) {
    return { label: "Auth Running", dotClass: "bg-amber-500" };
  }
  if (data.stateExists) {
    return { label: "State Ready", dotClass: "bg-green-500" };
  }
  return { label: "Idle", dotClass: "bg-red-500" };
}

function getBuildingConnectedOverlayLabel(
  data: BuildingConnectedAuthStatus | undefined
): string {
  if (data?.running) {
    return "Auth run in progress";
  }
  if (data?.stateExists) {
    return "State file ready";
  }
  return "Auth session idle";
}

function usePortalStatusToasts(data: AutomationStatus | undefined): void {
  const previousPortalReady = useRef<boolean | null>(null);
  const previousBusy = useRef<boolean | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }
    if (previousPortalReady.current === null) {
      previousPortalReady.current = data.portalReady;
      return;
    }
    if (previousPortalReady.current !== data.portalReady) {
      if (data.portalReady) {
        toast.success("Dust portal is ready");
      } else {
        toast.error("Dust portal requires login");
      }
      previousPortalReady.current = data.portalReady;
    }
  }, [data]);

  useEffect(() => {
    if (!data) {
      return;
    }
    if (previousBusy.current === null) {
      previousBusy.current = data.busy;
      return;
    }
    if (previousBusy.current && !data.busy) {
      toast.success("Automation step finished");
    }
    previousBusy.current = data.busy;
  }, [data]);
}

async function postAction<E extends string>(
  endpoint: E,
  options?: RunActionOptions
): Promise<AutomationActionPayload> {
  const headers =
    options?.body === undefined
      ? undefined
      : { "content-type": "application/json" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body:
      options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AutomationActionPayload
    | undefined;
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error || `Request failed with status ${response.status}`
    );
  }
  return payload ?? {};
}

/**
 * Clipboard bridge via VNC protocol.
 * Ctrl/Cmd+V reads local clipboard and sends it into the VNC session.
 * Copy direction is handled by onClipboard callback on VncPanel.
 */
function useVncClipboardBridge(
  visible: boolean,
  vncRef: RefObject<VncPanelHandle | null>
): void {
  const pasteIntoVnc = useCallback(async (): Promise<void> => {
    if (!navigator.clipboard?.readText) {
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text.length) {
        toast.message("Clipboard is empty");
        return;
      }
      vncRef.current?.clipboardPaste(text);
      toast.success("Pasted clipboard into VNC session");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  }, [vncRef]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteIntoVnc().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pasteIntoVnc, visible]);
}

function ActionButtons({
  action,
  disabled,
  runAction,
}: {
  action: AutomationActionEndpoint | null;
  disabled: boolean;
  runAction: (endpoint: AutomationActionEndpoint, msg: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        className="gap-2"
        disabled={disabled}
        onClick={() =>
          runAction("/api/automation/ready", "Portal session is ready")
        }
      >
        {action === "/api/automation/ready" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Ensure Bot Ready
      </Button>
      <Button
        className="gap-2"
        disabled={disabled}
        onClick={() =>
          runAction("/api/automation/keepalive", "Keepalive ping completed")
        }
        variant="outline"
      >
        {action === "/api/automation/keepalive" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Keep Alive Ping
      </Button>
      <Button
        className="gap-2"
        disabled={disabled}
        onClick={() => runAction("/api/automation/stop", "Session stopped")}
        variant="outline"
      >
        {action === "/api/automation/stop" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Square className="h-4 w-4" />
        )}
        Stop Session
      </Button>
    </div>
  );
}

/** Derive all display labels from automation status to reduce component complexity. */
function deriveDisplayState(
  data: AutomationStatus | undefined,
  visible: boolean
): {
  busyLabel: string;
  homePinLabel: string;
  lastPinnedHomeLabel: string;
  rootClassName: string;
  vncAspectRatio: string;
} {
  const busyLabel = data?.busy ? data.currentOperation || "Running" : "Idle";
  const viewportWidth = data?.viewportWidth || 1280;
  const viewportHeight = data?.viewportHeight || 1024;
  const vncAspectRatio = `${viewportWidth} / ${viewportHeight}`;

  const homePinTelemetryAvailable =
    (data?.lastPortalPinAt ?? null) !== null ||
    typeof data?.portalHomePinEnabled === "boolean";

  const lastPinnedHomeLabel = homePinTelemetryAvailable
    ? formatTimestamp(data?.lastPortalPinAt ?? null)
    : "N/A";

  let homePinLabel = "N/A";
  if (homePinTelemetryAvailable && data?.portalHomePinEnabled) {
    homePinLabel = `On (${Math.round((data.portalHomePinIntervalMs || 0) / 1000)}s)`;
  } else if (homePinTelemetryAvailable) {
    homePinLabel = "Off";
  }

  const rootClassName = visible
    ? "flex flex-col"
    : "pointer-events-none fixed inset-0 -z-10 opacity-0";

  return {
    busyLabel,
    homePinLabel,
    lastPinnedHomeLabel,
    rootClassName,
    vncAspectRatio,
  };
}

function writeToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

interface AutomationPageProps {
  visible?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Two automation portals share one component shell.
export function AutomationPage({ visible = true }: AutomationPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const activePortal = getPortalFromPath(location.pathname);

  const [action, setAction] = useState<AutomationActionEndpoint | null>(null);
  const [buildingConnectedAction, setBuildingConnectedAction] =
    useState<BuildingConnectedActionEndpoint | null>(null);
  const [validateUrl, setValidateUrl] = useState("");

  const autoEnsureAttempted = useRef(false);
  const maricopaVncRef = useRef<VncPanelHandle>(null);
  const buildingConnectedVncRef = useRef<VncPanelHandle>(null);

  const { data, error, isLoading, mutate } = useSWR<AutomationStatus>(
    visible && activePortal === "maricopa" ? "/api/automation/status" : null,
    fetcher,
    {
      refreshInterval: visible && activePortal === "maricopa" ? 5000 : 0,
      dedupingInterval: 2000,
      shouldRetryOnError: true,
    }
  );

  const {
    data: buildingConnectedStatus,
    error: buildingConnectedError,
    isLoading: buildingConnectedLoading,
    mutate: mutateBuildingConnected,
  } = useSWR<BuildingConnectedAuthStatus>(
    visible && activePortal === "buildingconnected"
      ? "/api/buildingconnected/auth/status"
      : null,
    fetcher,
    {
      refreshInterval:
        visible && activePortal === "buildingconnected" ? 3000 : 0,
      dedupingInterval: 1500,
      shouldRetryOnError: true,
    }
  );

  usePortalStatusToasts(activePortal === "maricopa" ? data : undefined);

  // VNC clipboard bridges — paste via Ctrl/Cmd+V, copy via onClipboard callback
  useVncClipboardBridge(visible && activePortal === "maricopa", maricopaVncRef);
  useVncClipboardBridge(
    visible && activePortal === "buildingconnected",
    buildingConnectedVncRef
  );

  const maricopaWsUrl = data?.vncWsUrl || getWsFallbackUrl(6080);
  const buildingConnectedWsUrl =
    buildingConnectedStatus?.vncWsUrl || getWsFallbackUrl(6081);
  const buildingConnectedVncAspectRatio = `${
    buildingConnectedStatus?.viewportWidth || 1920
  } / ${buildingConnectedStatus?.viewportHeight || 1080}`;

  const runAction = useCallback(
    async (
      endpoint: AutomationActionEndpoint,
      successMessage: string,
      options?: RunActionOptions
    ): Promise<void> => {
      setAction(endpoint);
      try {
        await postAction(endpoint, options);
        if (!options?.silentSuccess) {
          toast.success(successMessage);
        }
        await mutate();
      } catch (actionError) {
        const message =
          actionError instanceof Error
            ? actionError.message
            : String(actionError);
        toast.error(message);
      } finally {
        setAction(null);
      }
    },
    [mutate]
  );

  const runBuildingConnectedAction = useCallback(
    async (
      endpoint: BuildingConnectedActionEndpoint,
      successMessage: string,
      options?: RunActionOptions
    ): Promise<void> => {
      setBuildingConnectedAction(endpoint);
      try {
        await postAction(endpoint, options);
        if (!options?.silentSuccess) {
          toast.success(successMessage);
        }
        await mutateBuildingConnected();
      } catch (actionError) {
        const message =
          actionError instanceof Error
            ? actionError.message
            : String(actionError);
        toast.error(message);
      } finally {
        setBuildingConnectedAction(null);
      }
    },
    [mutateBuildingConnected]
  );

  useEffect(() => {
    if (
      !visible ||
      activePortal !== "maricopa" ||
      autoEnsureAttempted.current
    ) {
      return;
    }
    autoEnsureAttempted.current = true;
    runAction("/api/automation/ready", "Portal session is ready", {
      silentSuccess: true,
    }).catch(() => undefined);
  }, [activePortal, runAction, visible]);

  const displayState = deriveDisplayState(data, visible);
  const { label: sessionState, dotClass: sessionDotClass } =
    getSessionDisplay(data);
  const {
    label: buildingConnectedSessionState,
    dotClass: buildingConnectedSessionDotClass,
  } = getBuildingConnectedSessionDisplay(buildingConnectedStatus);

  const maricopaActionPending = action !== null;
  const buildingConnectedActionPending = buildingConnectedAction !== null;

  const headerTitle =
    activePortal === "buildingconnected"
      ? "BuildingConnected Auth Browser"
      : "Maricopa County Dust Portal";
  const breadcrumbLabel =
    activePortal === "buildingconnected"
      ? "BuildingConnected"
      : "Maricopa Portal";

  return (
    <div aria-hidden={!visible} className={displayState.rootClassName}>
      <PageHeader
        breadcrumbs={[{ label: breadcrumbLabel }]}
        title={headerTitle}
      />

      <div className="p-6 lg:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <Button
            onClick={() => navigate("/maricopa")}
            size="sm"
            variant={activePortal === "maricopa" ? "default" : "outline"}
          >
            Maricopa
          </Button>
          <Button
            onClick={() => navigate("/buildingconnected")}
            size="sm"
            variant={
              activePortal === "buildingconnected" ? "default" : "outline"
            }
          >
            BuildingConnected
          </Button>
        </div>

        {activePortal === "maricopa" && (
          <>
            <div className="mb-4 rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-medium text-sm">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${sessionDotClass}`}
                  />
                  <span>{sessionState}</span>
                </div>
                <ActionButtons
                  action={action}
                  disabled={maricopaActionPending}
                  runAction={runAction}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-muted-foreground text-sm lg:grid-cols-6">
                <div>Busy: {displayState.busyLabel}</div>
                <div>
                  Last login: {formatTimestamp(data?.lastLoginAt ?? null)}
                </div>
                <div>
                  Last keepalive:{" "}
                  {formatTimestamp(data?.lastKeepAliveAt ?? null)}
                </div>
                <div>Last pinned home: {displayState.lastPinnedHomeLabel}</div>
                <div>
                  Keepalive:{" "}
                  {data?.keepAliveEnabled
                    ? `On (${Math.round((data.keepAliveIntervalMs || 0) / 1000)}s)`
                    : "Off"}
                </div>
                <div>Home pin: {displayState.homePinLabel}</div>
              </div>

              <div className="mt-3 text-muted-foreground text-xs">
                Cmd/Ctrl+V pastes local clipboard into VNC session. VNC
                clipboard changes auto-sync to your local clipboard.
              </div>

              {error && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-500 text-sm">
                  Status check failed: {error.message}
                </div>
              )}
              {data?.lastError && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-500 text-sm">
                  {data.lastError}
                </div>
              )}
            </div>

            <CheckpointBanner />

            <VncPanel
              aspectRatio={displayState.vncAspectRatio}
              healthy={data?.portalReady ?? false}
              onClipboard={writeToClipboard}
              ref={maricopaVncRef}
              statusLabel={
                data?.portalReady ? "Portal ready" : "Portal not ready"
              }
              wsUrl={maricopaWsUrl}
            />

            {isLoading && (
              <div className="mt-2 text-muted-foreground text-xs">
                Loading status...
              </div>
            )}
          </>
        )}

        {activePortal === "buildingconnected" && (
          <>
            <div className="mb-4 rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-medium text-sm">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${buildingConnectedSessionDotClass}`}
                  />
                  <span>{buildingConnectedSessionState}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    disabled={buildingConnectedActionPending}
                    onClick={() =>
                      runBuildingConnectedAction(
                        "/api/buildingconnected/auth/start",
                        "BuildingConnected auth session started",
                        {
                          body: validateUrl.trim()
                            ? { validateUrl: validateUrl.trim() }
                            : {},
                        }
                      )
                    }
                  >
                    {buildingConnectedAction ===
                    "/api/buildingconnected/auth/start" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Start Auth Session
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={buildingConnectedActionPending}
                    onClick={() =>
                      runBuildingConnectedAction(
                        "/api/buildingconnected/auth/stop",
                        "BuildingConnected auth session stopped"
                      )
                    }
                    variant="outline"
                  >
                    {buildingConnectedAction ===
                    "/api/buildingconnected/auth/stop" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    Stop Session
                  </Button>
                </div>
              </div>

              <div className="mb-3 grid gap-2 lg:grid-cols-2">
                <label
                  className="text-muted-foreground text-xs"
                  htmlFor="bc-validate-url"
                >
                  Optional validation goto URL (downloads one file after auth)
                </label>
                <input
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  id="bc-validate-url"
                  onChange={(event) => setValidateUrl(event.target.value)}
                  placeholder="https://app.buildingconnected.com/goto/..."
                  type="url"
                  value={validateUrl}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-muted-foreground text-sm lg:grid-cols-4">
                <div>
                  Running: {buildingConnectedStatus?.running ? "Yes" : "No"}
                </div>
                <div>PID: {buildingConnectedStatus?.pid ?? "\u2014"}</div>
                <div>
                  State saved:{" "}
                  {buildingConnectedStatus?.stateExists ? "Yes" : "No"}
                </div>
                <div>
                  State updated:{" "}
                  {formatTimestamp(
                    buildingConnectedStatus?.stateLastModifiedAt ?? null
                  )}
                </div>
                <div>
                  State size:{" "}
                  {formatByteSize(
                    buildingConnectedStatus?.stateFileSize ?? null
                  )}
                </div>
                <div>
                  Last exit: {buildingConnectedStatus?.lastExitCode ?? "\u2014"}
                </div>
                <div>
                  Started:{" "}
                  {formatTimestamp(buildingConnectedStatus?.startedAt ?? null)}
                </div>
                <div>
                  Finished:{" "}
                  {formatTimestamp(buildingConnectedStatus?.finishedAt ?? null)}
                </div>
              </div>

              <div className="mt-3 text-muted-foreground text-xs">
                Flow: click Start Auth Session, open VNC, complete
                CAPTCHA/OTP/login, then wait for state save at{" "}
                <span className="font-mono">
                  {buildingConnectedStatus?.statePath ?? "\u2014"}
                </span>
                .
              </div>
              <div className="mt-1 text-muted-foreground text-xs">
                Cmd/Ctrl+V pastes local clipboard into VNC session. VNC
                clipboard changes auto-sync to your local clipboard.
              </div>

              {buildingConnectedError && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-500 text-sm">
                  Status check failed: {buildingConnectedError.message}
                </div>
              )}
              {buildingConnectedStatus?.lastError && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-500 text-sm">
                  {buildingConnectedStatus.lastError}
                </div>
              )}
            </div>

            <VncPanel
              aspectRatio={buildingConnectedVncAspectRatio}
              healthy={Boolean(buildingConnectedStatus?.stateExists)}
              onClipboard={writeToClipboard}
              ref={buildingConnectedVncRef}
              statusLabel={getBuildingConnectedOverlayLabel(
                buildingConnectedStatus
              )}
              wsUrl={buildingConnectedWsUrl}
            />

            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 font-medium text-sm">Bootstrap Log</div>
              {buildingConnectedStatus?.logTail?.length ? (
                <pre className="max-h-56 overflow-auto rounded-lg bg-black/80 p-3 font-mono text-xs text-zinc-100">
                  {buildingConnectedStatus.logTail.slice(-60).join("\n")}
                </pre>
              ) : (
                <div className="text-muted-foreground text-xs">
                  No log output yet.
                </div>
              )}
            </div>

            {buildingConnectedLoading && (
              <div className="mt-2 text-muted-foreground text-xs">
                Loading BuildingConnected status...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
