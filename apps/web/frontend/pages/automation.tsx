/**
 * Automation portal page
 *
 * Embedded noVNC views for Maricopa portal automation and BuildingConnected auth bootstrap.
 */

// biome-ignore lint/nursery/noExcessiveLinesPerFile: Maricopa and BuildingConnected views intentionally share one automation shell.
import { CheckCircle2, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import useSWR from "swr";
import { CheckpointBanner } from "@/apps/web/frontend/components/checkpoint-banner";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface AutomationStatus {
  active: boolean;
  isLoggedIn: boolean;
  portalReady: boolean;
  busy: boolean;
  currentOperation: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  lastKeepAliveAt: string | null;
  lastLoginAt: string | null;
  lastPortalPinAt?: string | null;
  lastError: string | null;
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  portalHomePinEnabled?: boolean;
  portalHomePinIntervalMs?: number;
  viewportWidth: number;
  viewportHeight: number;
  vncUrl: string;
}

interface BuildingConnectedAuthStatus {
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastError: string | null;
  logTail: string[];
  statePath: string;
  stateExists: boolean;
  stateFileSize: number | null;
  stateLastModifiedAt: string | null;
  startUrl: string;
  lastValidateUrl: string | null;
  manualAuthTimeoutMs: number;
  viewportWidth: number;
  viewportHeight: number;
  vncUrl: string;
}

type AutomationActionEndpoint =
  | "/api/automation/start"
  | "/api/automation/ready"
  | "/api/automation/keepalive"
  | "/api/automation/stop"
  | "/api/automation/clipboard/paste"
  | "/api/automation/clipboard/copy";

type BuildingConnectedActionEndpoint =
  | "/api/buildingconnected/auth/start"
  | "/api/buildingconnected/auth/stop"
  | "/api/buildingconnected/auth/clipboard/paste"
  | "/api/buildingconnected/auth/clipboard/copy";

interface RunActionOptions {
  silentSuccess?: boolean;
  body?: unknown;
}

interface AutomationActionPayload {
  success?: boolean;
  error?: string;
  text?: string;
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
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatByteSize(value: number | null): string {
  if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    return "—";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
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

async function postAutomation(
  endpoint: AutomationActionEndpoint,
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

async function postBuildingConnectedAuth(
  endpoint: BuildingConnectedActionEndpoint,
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

function useClipboardBridge(
  visible: boolean,
  mutate: () => Promise<unknown>,
  setAction: (action: AutomationActionEndpoint | null) => void
): void {
  const pasteFromLocalClipboard = useCallback(async (): Promise<void> => {
    setAction("/api/automation/clipboard/paste");
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard read is not available in this browser");
      }
      const text = await navigator.clipboard.readText();
      if (!text.length) {
        toast.message("Clipboard is empty");
        return;
      }

      await postAutomation("/api/automation/clipboard/paste", {
        body: { text },
      });
      toast.success("Pasted local clipboard into portal");
      await mutate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setAction(null);
    }
  }, [mutate, setAction]);

  const copySelectionToLocalClipboard = useCallback(async (): Promise<void> => {
    setAction("/api/automation/clipboard/copy");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard write is not available in this browser");
      }
      const payload = await postAutomation("/api/automation/clipboard/copy");
      const text = payload.text ?? "";
      if (!text.length) {
        toast.message("No selected portal text to copy");
        return;
      }

      await navigator.clipboard.writeText(text);
      toast.success("Copied portal selection to local clipboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setAction(null);
    }
  }, [setAction]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "v") {
        event.preventDefault();
        pasteFromLocalClipboard().catch(() => undefined);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        copySelectionToLocalClipboard().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelectionToLocalClipboard, pasteFromLocalClipboard, visible]);
}

function useBuildingConnectedClipboardBridge(
  visible: boolean,
  mutate: () => Promise<unknown>,
  setAction: (action: BuildingConnectedActionEndpoint | null) => void
): void {
  const pasteFromLocalClipboard = useCallback(async (): Promise<void> => {
    setAction("/api/buildingconnected/auth/clipboard/paste");
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard read is not available in this browser");
      }
      const text = await navigator.clipboard.readText();
      if (!text.length) {
        toast.message("Clipboard is empty");
        return;
      }

      await postBuildingConnectedAuth(
        "/api/buildingconnected/auth/clipboard/paste",
        {
          body: { text },
        }
      );
      toast.success("Pasted local clipboard into BuildingConnected auth");
      await mutate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setAction(null);
    }
  }, [mutate, setAction]);

  const copySelectionToLocalClipboard = useCallback(async (): Promise<void> => {
    setAction("/api/buildingconnected/auth/clipboard/copy");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard write is not available in this browser");
      }
      const payload = await postBuildingConnectedAuth(
        "/api/buildingconnected/auth/clipboard/copy"
      );
      const text = payload.text ?? "";
      if (!text.length) {
        toast.message("No selected text to copy from BuildingConnected auth");
        return;
      }

      await navigator.clipboard.writeText(text);
      toast.success("Copied BuildingConnected selection to local clipboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setAction(null);
    }
  }, [setAction]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "v") {
        event.preventDefault();
        pasteFromLocalClipboard().catch(() => undefined);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        copySelectionToLocalClipboard().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelectionToLocalClipboard, pasteFromLocalClipboard, visible]);
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

function VncStatusOverlay({
  label,
  healthy,
}: {
  label: string;
  healthy: boolean;
}) {
  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-black/80 px-3 py-1.5 font-mono text-xs backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
            healthy ? "bg-green-400" : "bg-amber-400"
          } opacity-75`}
        />
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            healthy ? "bg-green-500" : "bg-amber-500"
          }`}
        />
      </span>
      <span className="text-muted-foreground">{label}</span>
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

interface AutomationPageProps {
  visible?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This component coordinates two automation portals with shared polling/actions.
export function AutomationPage({ visible = true }: AutomationPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const activePortal = getPortalFromPath(location.pathname);

  const [action, setAction] = useState<AutomationActionEndpoint | null>(null);
  const [buildingConnectedAction, setBuildingConnectedAction] =
    useState<BuildingConnectedActionEndpoint | null>(null);
  const [validateUrl, setValidateUrl] = useState("");

  const autoEnsureAttempted = useRef(false);

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

  const maricopaFallbackVncUrl = useMemo(
    () =>
      `${window.location.protocol}//${window.location.hostname}:47821/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=false&shared=true`,
    []
  );
  const buildingConnectedFallbackVncUrl = useMemo(
    () =>
      `${window.location.protocol}//${window.location.hostname}:6081/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=false&shared=true`,
    []
  );

  const maricopaVncUrl = data?.vncUrl || maricopaFallbackVncUrl;
  const buildingConnectedVncUrl =
    buildingConnectedStatus?.vncUrl || buildingConnectedFallbackVncUrl;
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
        await postAutomation(endpoint, options);
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
        await postBuildingConnectedAuth(endpoint, options);
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

  useClipboardBridge(visible && activePortal === "maricopa", mutate, setAction);
  useBuildingConnectedClipboardBridge(
    visible && activePortal === "buildingconnected",
    mutateBuildingConnected,
    setBuildingConnectedAction
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
                Clipboard shortcuts: Cmd/Ctrl+C copies portal selection,
                Cmd/Ctrl+V pastes local clipboard into the active portal field.
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

            <div
              className="relative w-full overflow-hidden rounded-2xl border border-border bg-black"
              style={{ aspectRatio: displayState.vncAspectRatio }}
            >
              <iframe
                allow="clipboard-read; clipboard-write; fullscreen"
                className="absolute inset-0 h-full w-full border-0"
                src={maricopaVncUrl}
                title="Maricopa County Dust Portal"
              />

              <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]">
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
                  }}
                />
              </div>

              <VncStatusOverlay
                healthy={data?.portalReady ?? false}
                label={data?.portalReady ? "Portal ready" : "Portal not ready"}
              />
            </div>

            {isLoading && (
              <div className="mt-2 text-muted-foreground text-xs">
                Loading status…
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
                <div>PID: {buildingConnectedStatus?.pid ?? "—"}</div>
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
                  Last exit: {buildingConnectedStatus?.lastExitCode ?? "—"}
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
                  {buildingConnectedStatus?.statePath ?? "—"}
                </span>
                .
              </div>
              <div className="mt-1 text-muted-foreground text-xs">
                Clipboard shortcuts: Cmd/Ctrl+V pastes local clipboard into the
                active BuildingConnected field; Cmd/Ctrl+C copies the current
                selection.
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

            <div
              className="relative w-full overflow-hidden rounded-2xl border border-border bg-black"
              style={{ aspectRatio: buildingConnectedVncAspectRatio }}
            >
              <iframe
                allow="clipboard-read; clipboard-write; fullscreen"
                className="absolute inset-0 h-full w-full border-0"
                src={buildingConnectedVncUrl}
                title="BuildingConnected Auth Browser"
              />

              <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]">
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
                  }}
                />
              </div>

              <VncStatusOverlay
                healthy={Boolean(buildingConnectedStatus?.stateExists)}
                label={getBuildingConnectedOverlayLabel(
                  buildingConnectedStatus
                )}
              />
            </div>

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
                Loading BuildingConnected status…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
