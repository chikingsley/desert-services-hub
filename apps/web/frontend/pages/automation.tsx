/**
 * Automation portal page — Full-bleed VNC layout
 *
 * VNC panel fills the available page area with shared header/actions.
 * Uses @simonpeacocks/react-vnc for direct WebSocket VNC connections.
 */

import { CheckCircle2, ChevronDown, RefreshCw, Square } from "lucide-react";
import {
  Component,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import useSWR from "swr";
import { CheckpointBanner } from "@/apps/web/frontend/components/checkpoint-banner";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/apps/web/frontend/components/ui/dropdown-menu";
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
    keepAliveEnabled: boolean;
    keepAliveIntervalMs: number;
    lastError: string | null;
    lastKeepAliveAt: string | null;
    lastLoginAt: string | null;
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

interface VncPanelErrorBoundaryProps {
  children: ReactNode;
}

interface VncPanelErrorBoundaryState {
  errorMessage: string | null;
}

class VncPanelErrorBoundary extends Component<
  VncPanelErrorBoundaryProps,
  VncPanelErrorBoundaryState
> {
  override state: VncPanelErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown) {
    return {
      errorMessage:
        error instanceof Error ? error.message : `VNC render failed: ${String(error)}`,
    };
  }

  override componentDidCatch(error: unknown, info: unknown) {
    console.error("VNC panel render error", error, info);
  }

  override render() {
    if (this.state.errorMessage) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-black px-6 text-center text-sm text-white/60">
          <p className="max-w-xl">
            VNC player cannot initialize in this runtime.
          </p>
          <p className="mt-2 max-w-xl text-white/40">
            {this.state.errorMessage}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  enabled: boolean,
  vncRef: RefObject<VncPanelHandle | null>
): void {
  const lastPasteEventAtRef = useRef(0);

  const pasteTextIntoVnc = useCallback(
    (text: string): boolean => {
      if (!text.length) {
        toast.message("Clipboard is empty");
        return false;
      }
      vncRef.current?.clipboardPaste(text);
      toast.success("Pasted clipboard into VNC session");
      return true;
    },
    [vncRef]
  );

  const pasteFromBrowserClipboard = useCallback(async (): Promise<void> => {
    if (!navigator.clipboard?.readText) {
      return;
    }
    try {
      pasteTextIntoVnc(await navigator.clipboard.readText());
    } catch (clipError) {
      const message =
        clipError instanceof Error ? clipError.message : String(clipError);
      toast.error(message);
    }
  }, [pasteTextIntoVnc]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (!text) {
        return;
      }
      event.preventDefault();
      lastPasteEventAtRef.current = Date.now();
      pasteTextIntoVnc(text);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() === "v") {
        // Prefer native paste event data; fall back to clipboard API if no event fires.
        setTimeout(() => {
          if (Date.now() - lastPasteEventAtRef.current < 200) {
            return;
          }
          pasteFromBrowserClipboard().catch(() => undefined);
        }, 0);
      }
    };

    document.addEventListener("paste", onPaste, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [pasteFromBrowserClipboard, pasteTextIntoVnc, enabled]);
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

function writeToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

export function AutomationPage() {
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
    activePortal === "maricopa" ? "/api/automation/status" : null,
    fetcher,
    {
      refreshInterval: 5000,
      dedupingInterval: 2000,
      shouldRetryOnError: true,
    }
  );

  // --- SWR: BuildingConnected status ---
  const { data: bcStatus, error: bcError } =
    useSWR<BuildingConnectedAuthStatus>(
      activePortal === "buildingconnected"
        ? "/api/buildingconnected/auth/status"
        : null,
      fetcher,
      {
        refreshInterval: 3000,
        dedupingInterval: 1500,
        shouldRetryOnError: true,
      }
    );

  // --- Toasts ---
  usePortalStatusToasts(activePortal === "maricopa" ? data : undefined);

  // --- VNC clipboard bridges ---
  useVncClipboardBridge(activePortal === "maricopa", maricopaVncRef);
  useVncClipboardBridge(
    activePortal === "buildingconnected",
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
    if (activePortal !== "maricopa" || autoEnsureAttempted.current) {
      return;
    }
    autoEnsureAttempted.current = true;
    runAction("/api/automation/ready", "Portal session is ready", {
      silentSuccess: true,
    }).catch(() => undefined);
  }, [activePortal, runAction]);

  // --- Sync activePortal with location (deep links) ---
  useEffect(() => {
    setActivePortal(getPortalFromPath(location.pathname));
  }, [location.pathname]);

  // --- Derived display state ---
  const { label: sessionLabel, dotClass: sessionDotClass } =
    getSessionDisplay(data);
  const { label: bcSessionLabel, dotClass: bcSessionDotClass } =
    getBuildingConnectedSessionDisplay(bcStatus);

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

  const activeError =
    activePortal === "maricopa" ? (error ?? null) : (bcError ?? null);
  const activeLastError =
    activePortal === "maricopa"
      ? (data?.lastError ?? null)
      : (bcStatus?.lastError ?? null);

  const otherPortal: AutomationPortal =
    activePortal === "maricopa" ? "buildingconnected" : "maricopa";

  const displayPortalLabel =
    activePortal === "maricopa" ? "Maricopa" : "BuildingConnected";
  const otherPortalLabel =
    otherPortal === "maricopa" ? "Maricopa" : "BuildingConnected";
  const headerStatus =
    activePortal === "maricopa" ? sessionLabel : bcSessionLabel;
  const headerStatusClass =
    activePortal === "maricopa" ? sessionDotClass : bcSessionDotClass;

  const headerActions = (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1.5 text-muted-foreground text-xs sm:flex">
        <span className={`size-2 rounded-full ${headerStatusClass}`} />
        <span>{headerStatus}</span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-7 gap-1.5 border-white/20 bg-white/5 text-xs hover:bg-white/10"
            size="sm"
            variant="outline"
          >
            {displayPortalLabel}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="border-white/20 bg-black/90 text-white/80 backdrop-blur-md"
        >
          <DropdownMenuItem onClick={() => setActivePortal(otherPortal)}>
            {otherPortalLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {activePortal === "maricopa" && (
        <>
          <Button
            className="h-7 gap-1.5 border-white/20 bg-white/5 text-xs hover:bg-white/10"
            disabled={actionPending}
            onClick={() =>
              runAction("/api/automation/ready", "Portal session is ready")
            }
            size="sm"
            variant="outline"
          >
            {activeActionKey === "ready" ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Ensure Ready
          </Button>
          <Button
            className="h-7 gap-1.5 border-white/20 bg-white/5 text-xs hover:bg-white/10"
            disabled={actionPending}
            onClick={() =>
              runAction("/api/automation/keepalive", "Keepalive ping completed")
            }
            size="sm"
            variant="outline"
          >
            {activeActionKey === "keepalive" ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Keep Alive
          </Button>
        </>
      )}

      <Button
        className="h-7 gap-1.5 border-white/20 bg-white/5 text-xs hover:bg-white/10"
        disabled={actionPending}
        onClick={() => runAction("/api/automation/stop", "Session stopped")}
        size="sm"
        variant="outline"
      >
        {activeActionKey === "stop" ? (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
        Stop
      </Button>
    </div>
  );

  const headerTitle =
    activePortal === "maricopa" ? "Maricopa Automation" : "BuildingConnected";

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <PageHeader
        actions={headerActions}
        breadcrumbs={[
          { label: "Automation", href: "/automation" },
          {
            label:
              activePortal === "maricopa" ? "Maricopa" : "BuildingConnected",
          },
        ]}
        description={`${displayPortalLabel} portal control`}
        title={headerTitle}
      />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        {/* Error banners */}
        {activeError || activeLastError ? (
          <div className="pointer-events-none flex-none space-y-2 px-3 pt-3">
            {activeError && (
              <div className="pointer-events-auto rounded-lg border border-red-500/30 bg-red-950/80 px-3 py-2 text-red-300 text-sm backdrop-blur-sm">
                Status check failed: {activeError.message}
              </div>
            )}
            {activeLastError && !activeError && (
              <div className="pointer-events-auto rounded-lg border border-amber-500/30 bg-amber-950/80 px-3 py-2 text-amber-300 text-sm backdrop-blur-sm">
                {activeLastError}
              </div>
            )}
          </div>
        ) : null}

        {/* VNC fills available space below controls */}
        <div className="relative flex min-h-0 flex-1">
          {vncState.wsUrl ? (
            <VncPanelErrorBoundary key={vncState.wsUrl}>
              <VncPanel
                aspectRatio="auto"
                healthy={vncState.healthy}
                onClipboard={writeToClipboard}
                ref={activeVncRef}
                statusLabel={vncState.statusLabel}
                wsUrl={vncState.wsUrl}
              />
            </VncPanelErrorBoundary>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black font-mono text-sm text-white/40">
              Connecting to VNC...
            </div>
          )}

          {/* Checkpoint banner — floating above VNC status badge */}
          <div className="pointer-events-none absolute inset-x-3 bottom-16 z-30">
            <CheckpointBanner />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AutomationPage;
