/**
 * Maricopa portal page
 *
 * Always-on embedded VNC view of the permit-worker browser session.
 */

import { CheckCircle2, Loader2, RefreshCw, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
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
  lastPortalPinAt: string | null;
  lastError: string | null;
  keepAliveEnabled: boolean;
  keepAliveIntervalMs: number;
  portalHomePinEnabled: boolean;
  portalHomePinIntervalMs: number;
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

interface RunActionOptions {
  silentSuccess?: boolean;
  body?: unknown;
}

interface AutomationActionPayload {
  success?: boolean;
  error?: string;
  text?: string;
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

interface AutomationPageProps {
  visible?: boolean;
}

export function AutomationPage({ visible = true }: AutomationPageProps) {
  const [action, setAction] = useState<AutomationActionEndpoint | null>(null);
  const previousPortalReady = useRef<boolean | null>(null);
  const previousBusy = useRef<boolean | null>(null);
  const autoEnsureAttempted = useRef(false);
  const { data, error, isLoading, mutate } = useSWR<AutomationStatus>(
    "/api/automation/status",
    fetcher,
    {
      refreshInterval: visible ? 5000 : 0,
      dedupingInterval: 2000,
      shouldRetryOnError: true,
    }
  );

  const fallbackVncUrl = useMemo(
    () =>
      `${window.location.protocol}//${window.location.hostname}:47821/vnc.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=2000&view_only=false&shared=true`,
    []
  );
  const vncUrl = data?.vncUrl || fallbackVncUrl;

  const postAutomation = useCallback(
    async (
      endpoint: AutomationActionEndpoint,
      options?: RunActionOptions
    ): Promise<AutomationActionPayload> => {
      const headers =
        options?.body === undefined
          ? undefined
          : { "content-type": "application/json" };
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body:
          options?.body === undefined
            ? undefined
            : JSON.stringify(options.body),
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
    },
    []
  );

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
    [mutate, postAutomation]
  );

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
  }, [mutate, postAutomation]);

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
  }, [postAutomation]);

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

  useEffect(() => {
    if (!visible || autoEnsureAttempted.current) {
      return;
    }
    autoEnsureAttempted.current = true;
    runAction("/api/automation/ready", "Portal session is ready", {
      silentSuccess: true,
    }).catch(() => undefined);
  }, [runAction, visible]);

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

  let sessionState = "Checking";
  let sessionDotClass = "bg-red-500";
  if (data) {
    if (data.portalReady) {
      sessionState = "Ready";
      sessionDotClass = "bg-green-500";
    } else if (data.active) {
      sessionState = "Login Needed";
      sessionDotClass = "bg-amber-500";
    } else {
      sessionState = "Offline";
      sessionDotClass = "bg-red-500";
    }
  }
  const actionPending = action !== null;
  const busyLabel = data?.busy ? data.currentOperation || "Running" : "Idle";
  const viewportWidth = data?.viewportWidth || 1280;
  const viewportHeight = data?.viewportHeight || 1024;
  const vncAspectRatio = `${viewportWidth} / ${viewportHeight}`;
  const rootClassName = visible
    ? "flex flex-col"
    : "pointer-events-none fixed inset-0 -z-10 opacity-0";

  return (
    <div aria-hidden={!visible} className={rootClassName}>
      <PageHeader
        breadcrumbs={[{ label: "Maricopa Portal" }]}
        title="Maricopa County Dust Portal"
      />

      <div className="p-6 lg:p-8">
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 font-medium text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${sessionDotClass}`} />
              <span>{sessionState}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-2"
                disabled={actionPending}
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
                disabled={actionPending}
                onClick={() =>
                  runAction(
                    "/api/automation/keepalive",
                    "Keepalive ping completed"
                  )
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
                disabled={actionPending}
                onClick={() =>
                  runAction("/api/automation/stop", "Session stopped")
                }
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
          </div>

          <div className="grid grid-cols-2 gap-2 text-muted-foreground text-sm lg:grid-cols-6">
            <div>Busy: {busyLabel}</div>
            <div>Last login: {formatTimestamp(data?.lastLoginAt ?? null)}</div>
            <div>
              Last keepalive: {formatTimestamp(data?.lastKeepAliveAt ?? null)}
            </div>
            <div>
              Last pinned home: {formatTimestamp(data?.lastPortalPinAt ?? null)}
            </div>
            <div>
              Keepalive:{" "}
              {data?.keepAliveEnabled
                ? `On (${Math.round((data.keepAliveIntervalMs || 0) / 1000)}s)`
                : "Off"}
            </div>
            <div>
              Home pin:{" "}
              {data?.portalHomePinEnabled
                ? `On (${Math.round((data.portalHomePinIntervalMs || 0) / 1000)}s)`
                : "Off"}
            </div>
          </div>

          <div className="mt-3 text-muted-foreground text-xs">
            Clipboard shortcuts: Cmd/Ctrl+C copies portal selection, Cmd/Ctrl+V
            pastes local clipboard into the active portal field.
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

        <div
          className="relative w-full overflow-hidden rounded-2xl border border-border bg-black"
          style={{ aspectRatio: vncAspectRatio }}
        >
          <iframe
            allow="clipboard-read; clipboard-write; fullscreen"
            className="absolute inset-0 h-full w-full border-0"
            src={vncUrl}
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

          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-black/80 px-3 py-1.5 font-mono text-xs backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
                  data?.portalReady ? "bg-green-400" : "bg-amber-400"
                } opacity-75`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  data?.portalReady ? "bg-green-500" : "bg-amber-500"
                }`}
              />
            </span>
            <span className="text-muted-foreground">
              {data?.portalReady ? "Portal ready" : "Portal not ready"}
            </span>
          </div>
        </div>

        {isLoading && (
          <div className="mt-2 text-muted-foreground text-xs">
            Loading status…
          </div>
        )}
      </div>
    </div>
  );
}
