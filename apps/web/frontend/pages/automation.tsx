/**
 * Automation portal page — Full-bleed VNC layout
 *
 * VNC panel fills 100% of the viewport. All controls float on top.
 * Uses @simonpeacocks/react-vnc for direct WebSocket VNC connections.
 */

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import useSWR from "swr";
import { AutomationToolbar } from "@/apps/web/frontend/components/automation-toolbar";
import { CheckpointBanner } from "@/apps/web/frontend/components/checkpoint-banner";
import {
  VncPanel,
  type VncPanelHandle,
} from "@/apps/web/frontend/components/vnc-panel";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  session: {
    active: boolean;
    busy: boolean;
    currentOperation: string | null;
    isLoggedIn: boolean;
    lastError: string | null;
    portalReady: boolean;
    startedAt: string | null;
  };
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

type AutomationPortal = "maricopa" | "buildingconnected";

type AutomationActionEndpoint =
  | "/api/automation/start"
  | "/api/automation/ready"
  | "/api/automation/keepalive"
  | "/api/automation/stop";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getPortalFromPath(pathname: string): AutomationPortal {
  if (pathname === "/buildingconnected") {
    return "buildingconnected";
  }
  return "maricopa";
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
): { label: string; dotClass: string } {
  if (!data) {
    return { label: "Checking", dotClass: "bg-red-500" };
  }
  if (data.session?.portalReady) {
    return { label: "Ready", dotClass: "bg-green-500" };
  }
  if (data.session?.active) {
    return { label: "Login Needed", dotClass: "bg-amber-500" };
  }
  if (data.running) {
    return { label: "Auth Running", dotClass: "bg-amber-500" };
  }
  return { label: "Offline", dotClass: "bg-red-500" };
}

function getVncStatusLabel(
  portal: AutomationPortal,
  maricopa: AutomationStatus | undefined,
  bc: BuildingConnectedAuthStatus | undefined
): string {
  if (portal === "maricopa") {
    return maricopa?.portalReady ? "Portal ready" : "Portal not ready";
  }
  if (bc?.session?.portalReady) {
    return "Portal ready";
  }
  if (bc?.session?.active) {
    return "Session active — login needed";
  }
  if (bc?.running) {
    return "Auth bootstrap in progress";
  }
  return "Session idle";
}

function deriveVncState(
  portal: AutomationPortal,
  maricopaWsUrl: string,
  bcWsUrl: string,
  maricopa: AutomationStatus | undefined,
  bc: BuildingConnectedAuthStatus | undefined
): { wsUrl: string; healthy: boolean; statusLabel: string } {
  const isMaricopa = portal === "maricopa";
  return {
    wsUrl: isMaricopa ? maricopaWsUrl : bcWsUrl,
    healthy: isMaricopa
      ? (maricopa?.portalReady ?? false)
      : (bc?.session?.portalReady ?? false),
    statusLabel: getVncStatusLabel(portal, maricopa, bc),
  };
}

interface TelemetryData {
  busy: string;
  homePin: string;
  keepAlive: string;
  lastKeepAlive: string;
  lastLogin: string;
  lastPinnedHome: string;
}

function deriveTelemetry(data: AutomationStatus | undefined): TelemetryData {
  const homePinAvailable =
    (data?.lastPortalPinAt ?? null) !== null ||
    typeof data?.portalHomePinEnabled === "boolean";

  let homePinLabel = "N/A";
  if (homePinAvailable && data?.portalHomePinEnabled) {
    homePinLabel = `On (${Math.round((data.portalHomePinIntervalMs || 0) / 1000)}s)`;
  } else if (homePinAvailable) {
    homePinLabel = "Off";
  }

  return {
    busy: data?.busy ? data.currentOperation || "Running" : "Idle",
    lastLogin: formatTimestamp(data?.lastLoginAt ?? null),
    lastKeepAlive: formatTimestamp(data?.lastKeepAliveAt ?? null),
    lastPinnedHome: homePinAvailable
      ? formatTimestamp(data?.lastPortalPinAt ?? null)
      : "N/A",
    keepAlive: data?.keepAliveEnabled
      ? `On (${Math.round((data.keepAliveIntervalMs || 0) / 1000)}s)`
      : "Off",
    homePin: homePinLabel,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

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
    } catch (clipError) {
      const message =
        clipError instanceof Error ? clipError.message : String(clipError);
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

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

async function postAction(
  endpoint: string,
  options?: { body?: unknown; silentSuccess?: boolean }
): Promise<{ error?: string; success?: boolean }> {
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
    | { error?: string; success?: boolean }
    | undefined;
  if (!response.ok || payload?.success === false) {
    throw new Error(
      payload?.error || `Request failed with status ${response.status}`
    );
  }
  return payload ?? {};
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AutomationPageProps {
  visible?: boolean;
}

function writeToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

export function AutomationPage({ visible = true }: AutomationPageProps) {
  const location = useLocation();
  const [activePortal, setActivePortal] = useState<AutomationPortal>(
    getPortalFromPath(location.pathname)
  );

  const [action, setAction] = useState<AutomationActionEndpoint | null>(null);
  const autoEnsureAttempted = useRef(false);
  const maricopaVncRef = useRef<VncPanelHandle>(null);
  const buildingConnectedVncRef = useRef<VncPanelHandle>(null);

  // --- SWR: Maricopa status ---
  const { data, error, mutate } = useSWR<AutomationStatus>(
    visible && activePortal === "maricopa" ? "/api/automation/status" : null,
    fetcher,
    {
      refreshInterval: visible ? 5000 : 0,
      dedupingInterval: 2000,
      shouldRetryOnError: true,
    }
  );

  // --- SWR: BuildingConnected status ---
  const { data: bcStatus, error: bcError } =
    useSWR<BuildingConnectedAuthStatus>(
      visible && activePortal === "buildingconnected"
        ? "/api/buildingconnected/auth/status"
        : null,
      fetcher,
      {
        refreshInterval: visible ? 3000 : 0,
        dedupingInterval: 1500,
        shouldRetryOnError: true,
      }
    );

  // --- Toasts ---
  usePortalStatusToasts(activePortal === "maricopa" ? data : undefined);

  // --- VNC clipboard bridges ---
  useVncClipboardBridge(visible && activePortal === "maricopa", maricopaVncRef);
  useVncClipboardBridge(
    visible && activePortal === "buildingconnected",
    buildingConnectedVncRef
  );

  // --- WS URLs ---
  // Don't use fallback URLs — VncScreen only connects once on mount (empty deps
  // in useEffect), so if we render with a wrong URL first, it never reconnects
  // when the real URL arrives from SWR.
  const maricopaWsUrl = data?.vncWsUrl ?? "";
  const buildingConnectedWsUrl = bcStatus?.vncWsUrl ?? "";

  // --- Action handler ---
  const runAction = useCallback(
    async (
      endpoint: AutomationActionEndpoint,
      successMessage: string,
      options?: { body?: unknown; silentSuccess?: boolean }
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

  // --- Auto-ensure on first visible ---
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

  // --- Sync activePortal with location (deep links) ---
  useEffect(() => {
    setActivePortal(getPortalFromPath(location.pathname));
  }, [location.pathname]);

  // --- Derived display state ---
  const { label: sessionLabel, dotClass: sessionDotClass } =
    getSessionDisplay(data);
  const { label: bcSessionLabel, dotClass: bcSessionDotClass } =
    getBuildingConnectedSessionDisplay(bcStatus);

  const telemetry = deriveTelemetry(data);

  const actionPending = action !== null;
  const activeActionKey = action?.split("/").pop() ?? null;

  // --- Determine active VNC state ---
  const vncState = deriveVncState(
    activePortal,
    maricopaWsUrl,
    buildingConnectedWsUrl,
    data,
    bcStatus
  );
  const activeVncRef =
    activePortal === "maricopa" ? maricopaVncRef : buildingConnectedVncRef;

  const rootClassName = visible
    ? "absolute inset-0 overflow-hidden"
    : "pointer-events-none fixed inset-0 -z-10 opacity-0";

  const activeError =
    activePortal === "maricopa" ? (error ?? null) : (bcError ?? null);
  const activeLastError =
    activePortal === "maricopa"
      ? (data?.lastError ?? null)
      : (bcStatus?.lastError ?? null);

  return (
    <div aria-hidden={!visible} className={rootClassName}>
      {/* VNC fills entire surface — only render once we have a real WS URL.
          key={wsUrl} forces React to remount if the URL ever changes. */}
      {vncState.wsUrl ? (
        <VncPanel
          aspectRatio="auto"
          healthy={vncState.healthy}
          key={vncState.wsUrl}
          onClipboard={writeToClipboard}
          ref={activeVncRef}
          statusLabel={vncState.statusLabel}
          wsUrl={vncState.wsUrl}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black font-mono text-sm text-white/40">
          Connecting to VNC...
        </div>
      )}

      {/* Floating toolbar */}
      <AutomationToolbar
        actionPending={actionPending}
        activeAction={activeActionKey}
        activePortal={activePortal}
        buildingConnectedDotClass={bcSessionDotClass}
        buildingConnectedLabel={bcSessionLabel}
        error={activeError}
        lastError={activeLastError}
        onEnsureReady={() =>
          runAction("/api/automation/ready", "Portal session is ready")
        }
        onKeepAlive={() =>
          runAction("/api/automation/keepalive", "Keepalive ping completed")
        }
        onPortalChange={setActivePortal}
        onStop={() => runAction("/api/automation/stop", "Session stopped")}
        sessionDotClass={sessionDotClass}
        sessionLabel={sessionLabel}
        telemetry={telemetry}
      />

      {/* Checkpoint banner — floating above VNC status badge */}
      <div className="absolute inset-x-3 bottom-16 z-30">
        <CheckpointBanner />
      </div>
    </div>
  );
}
