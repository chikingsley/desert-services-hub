# Full-Bleed VNC Automation Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the chrome-heavy automation page with a full-bleed VNC layout where the portal fills 100% of the viewport and all controls float on top.

**Architecture:** The VNC panel becomes the root surface (filling SidebarInset). A single floating toolbar provides status + actions. Telemetry moves to a popover. CheckpointBanner floats as an overlay. Sidebar collapses two nav items into one "Automation" entry.

**Tech Stack:** React 19, React Router, SWR, Tailwind CSS, Radix Popover, lucide-react, @simonpeacocks/react-vnc

**Design doc:** `docs/plans/2026-02-24-automation-fullbleed-design.md`

---

### Task 1: Consolidate sidebar nav items

**Files:**
- Modify: `apps/web/frontend/components/app-sidebar.tsx:51-58`

**Step 1: Replace the two sidebar items with one**

In `app-sidebar.tsx`, the `manageItems` array (lines 51-59) currently has:

```ts
{ title: "Maricopa Portal", href: "/maricopa", icon: Monitor },
{ title: "BuildingConnected", href: "/buildingconnected", icon: Building2 },
```

Replace both with a single entry:

```ts
{ title: "Automation", href: "/automation", icon: Monitor },
```

Remove the `Building2` import from lucide-react (line 2) since it's no longer used.

**Step 2: Verify sidebar renders**

Run: `bun run apps/web/server.ts` (or check running container)
Expected: Sidebar shows single "Automation" item instead of two separate ones. Clicking it navigates to `/automation`.

**Step 3: Commit**

```bash
git add apps/web/frontend/components/app-sidebar.tsx
git commit -m "refactor: consolidate Maricopa + BuildingConnected into single Automation nav item"
```

---

### Task 2: Create the floating toolbar component

**Files:**
- Create: `apps/web/frontend/components/automation-toolbar.tsx`

**Step 1: Create the toolbar component**

This component replaces the status card + tab buttons + action buttons. It floats on top of the VNC panel.

```tsx
/**
 * Floating toolbar for the automation page.
 * Renders on top of the full-bleed VNC panel.
 * Uses shadcn/ui components (Button, Popover, DropdownMenu).
 */

import { CheckCircle2, ChevronDown, Info, Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/apps/web/frontend/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/apps/web/frontend/components/ui/popover";

type AutomationPortal = "maricopa" | "buildingconnected";

interface AutomationToolbarProps {
  activePortal: AutomationPortal;
  actionPending: boolean;
  activeAction: string | null;
  error: Error | null;
  lastError: string | null;
  onPortalChange: (portal: AutomationPortal) => void;
  onEnsureReady: () => void;
  onKeepAlive: () => void;
  onStop: () => void;
  sessionLabel: string;
  sessionDotClass: string;
  telemetry: {
    busy: string;
    lastLogin: string;
    lastKeepAlive: string;
    lastPinnedHome: string;
    keepAlive: string;
    homePin: string;
  };
  buildingConnectedLabel?: string;
  buildingConnectedDotClass?: string;
}

function formatPortalLabel(portal: AutomationPortal): string {
  return portal === "buildingconnected" ? "BuildingConnected" : "Maricopa";
}

export function AutomationToolbar({
  activePortal,
  actionPending,
  activeAction,
  error,
  lastError,
  onPortalChange,
  onEnsureReady,
  onKeepAlive,
  onStop,
  sessionLabel,
  sessionDotClass,
  telemetry,
  buildingConnectedLabel,
  buildingConnectedDotClass,
}: AutomationToolbarProps) {
  const otherPortal: AutomationPortal =
    activePortal === "maricopa" ? "buildingconnected" : "maricopa";

  const displayLabel =
    activePortal === "buildingconnected" && buildingConnectedLabel
      ? buildingConnectedLabel
      : sessionLabel;
  const displayDotClass =
    activePortal === "buildingconnected" && buildingConnectedDotClass
      ? buildingConnectedDotClass
      : sessionDotClass;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2">
      {/* Main toolbar */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
        {/* Left: status indicator with telemetry popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              className="gap-2 border-0 bg-transparent text-white/90 text-sm hover:bg-white/10"
              size="sm"
              variant="ghost"
            >
              <span className={`h-2 w-2 rounded-full ${displayDotClass}`} />
              <span className="font-medium">{displayLabel}</span>
              <Info className="h-3.5 w-3.5 text-white/40" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-64 border-white/10 bg-black/90 text-white/80 backdrop-blur-md"
          >
            <div className="grid gap-1.5 text-xs">
              <div className="mb-1 font-medium text-white/60 text-[11px] uppercase tracking-wider">
                Session Telemetry
              </div>
              <div>Busy: {telemetry.busy}</div>
              <div>Last login: {telemetry.lastLogin}</div>
              <div>Last keepalive: {telemetry.lastKeepAlive}</div>
              <div>Last pinned home: {telemetry.lastPinnedHome}</div>
              <div>Keepalive: {telemetry.keepAlive}</div>
              <div>Home pin: {telemetry.homePin}</div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Portal switcher — shadcn DropdownMenu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-7 gap-1.5 border-white/10 bg-transparent text-white/70 text-xs hover:bg-white/10 hover:text-white"
              size="sm"
              variant="outline"
            >
              {formatPortalLabel(activePortal)}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border-white/10 bg-black/90 text-white/80 backdrop-blur-md"
          >
            <DropdownMenuItem onClick={() => onPortalChange(otherPortal)}>
              {formatPortalLabel(otherPortal)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clipboard hint */}
        <span className="hidden text-white/30 text-xs lg:block">
          {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+V to paste
        </span>

        {/* Action buttons (Maricopa only) */}
        {activePortal === "maricopa" && (
          <div className="flex items-center gap-1.5">
            <Button
              className="h-7 gap-1.5 border-white/10 bg-white/10 text-white/90 text-xs hover:bg-white/20"
              disabled={actionPending}
              onClick={onEnsureReady}
              size="sm"
              variant="outline"
            >
              {activeAction === "ready" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Ensure Ready
            </Button>
            <Button
              className="h-7 gap-1.5 border-white/10 bg-white/10 text-white/90 text-xs hover:bg-white/20"
              disabled={actionPending}
              onClick={onKeepAlive}
              size="sm"
              variant="outline"
            >
              {activeAction === "keepalive" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Keep Alive
            </Button>
            <Button
              className="h-7 gap-1.5 border-white/10 bg-white/10 text-white/90 text-xs hover:bg-white/20"
              disabled={actionPending}
              onClick={onStop}
              size="sm"
              variant="outline"
            >
              {activeAction === "stop" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              Stop
            </Button>
          </div>
        )}
      </div>

      {/* Error banners — float below toolbar */}
      {error && (
        <div className="pointer-events-auto rounded-lg border border-red-500/30 bg-red-950/80 px-3 py-2 text-red-300 text-sm backdrop-blur-sm">
          Status check failed: {error.message}
        </div>
      )}
      {lastError && !error && (
        <div className="pointer-events-auto rounded-lg border border-amber-500/30 bg-amber-950/80 px-3 py-2 text-amber-300 text-sm backdrop-blur-sm">
          {lastError}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `bun build apps/web/frontend/components/automation-toolbar.tsx --no-bundle` (or just check for TypeScript errors)
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/frontend/components/automation-toolbar.tsx
git commit -m "feat: add floating AutomationToolbar component for full-bleed VNC layout"
```

---

### Task 3: Rewrite automation.tsx to full-bleed layout

**Files:**
- Modify: `apps/web/frontend/pages/automation.tsx` (full rewrite)

**Step 1: Rewrite the component**

This is the core change. The automation page becomes a full-bleed container with VNC filling 100% and floating overlays. The logic (SWR hooks, action handlers, clipboard bridge, toast notifications) is preserved — only the layout changes.

Key structural changes:
- Remove `<PageHeader>`, the `p-6 lg:p-8` wrapper, the status card `<div>`, the tab buttons
- Root becomes `<div className="relative h-full w-full">` (fills SidebarInset)
- VNC panel renders directly inside the root with `style={{ width: "100%", height: "100%" }}` instead of using aspect-ratio
- `<AutomationToolbar>` floats on top
- `<CheckpointBanner>` renders inside a floating positioned wrapper
- Portal switching uses `useState` instead of URL routing (since both are on `/automation`)
- The `useLocation`/`useNavigate` for portal switching replaced by local state, but deep-link routes (`/maricopa`, `/buildingconnected`) still set initial state

Replace the full content of `automation.tsx` with:

```tsx
/**
 * Automation portal page — Full-bleed VNC layout
 *
 * VNC panel fills 100% of the viewport. All controls float on top.
 * Uses @simonpeacocks/react-vnc for direct WebSocket VNC connections.
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
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
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getWsFallbackUrl(port: number): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:${port}`;
}

function getPortalFromPath(pathname: string): AutomationPortal {
  if (pathname === "/buildingconnected") return "buildingconnected";
  return "maricopa";
}

function getSessionDisplay(data: AutomationStatus | undefined): {
  label: string;
  dotClass: string;
} {
  if (!data) return { label: "Checking", dotClass: "bg-red-500" };
  if (data.portalReady) return { label: "Ready", dotClass: "bg-green-500" };
  if (data.active) return { label: "Login Needed", dotClass: "bg-amber-500" };
  return { label: "Offline", dotClass: "bg-red-500" };
}

function getBuildingConnectedSessionDisplay(
  data: BuildingConnectedAuthStatus | undefined
): { label: string; dotClass: string } {
  if (!data) return { label: "Checking", dotClass: "bg-red-500" };
  if (data.running) return { label: "Auth Running", dotClass: "bg-amber-500" };
  if (data.stateExists) return { label: "State Ready", dotClass: "bg-green-500" };
  return { label: "Idle", dotClass: "bg-red-500" };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function usePortalStatusToasts(data: AutomationStatus | undefined): void {
  const previousPortalReady = useRef<boolean | null>(null);
  const previousBusy = useRef<boolean | null>(null);

  useEffect(() => {
    if (!data) return;
    if (previousPortalReady.current === null) {
      previousPortalReady.current = data.portalReady;
      return;
    }
    if (previousPortalReady.current !== data.portalReady) {
      if (data.portalReady) toast.success("Dust portal is ready");
      else toast.error("Dust portal requires login");
      previousPortalReady.current = data.portalReady;
    }
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (previousBusy.current === null) {
      previousBusy.current = data.busy;
      return;
    }
    if (previousBusy.current && !data.busy) toast.success("Automation step finished");
    previousBusy.current = data.busy;
  }, [data]);
}

function useVncClipboardBridge(
  visible: boolean,
  vncRef: RefObject<VncPanelHandle | null>
): void {
  const pasteIntoVnc = useCallback(async (): Promise<void> => {
    if (!navigator.clipboard?.readText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.length) {
        toast.message("Clipboard is empty");
        return;
      }
      vncRef.current?.clipboardPaste(text);
      toast.success("Pasted clipboard into VNC session");
    } catch (clipError) {
      const message = clipError instanceof Error ? clipError.message : String(clipError);
      toast.error(message);
    }
  }, [vncRef]);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
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
    options?.body === undefined ? undefined : { "content-type": "application/json" };
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => ({}))) as
    | { error?: string; success?: boolean }
    | undefined;
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
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
    { refreshInterval: visible ? 5000 : 0, dedupingInterval: 2000, shouldRetryOnError: true }
  );

  // --- SWR: BuildingConnected status ---
  const { data: bcStatus, error: bcError } = useSWR<BuildingConnectedAuthStatus>(
    visible && activePortal === "buildingconnected"
      ? "/api/buildingconnected/auth/status"
      : null,
    fetcher,
    { refreshInterval: visible ? 3000 : 0, dedupingInterval: 1500, shouldRetryOnError: true }
  );

  // --- Toasts ---
  usePortalStatusToasts(activePortal === "maricopa" ? data : undefined);

  // --- VNC clipboard bridges ---
  useVncClipboardBridge(visible && activePortal === "maricopa", maricopaVncRef);
  useVncClipboardBridge(visible && activePortal === "buildingconnected", buildingConnectedVncRef);

  // --- WS URLs ---
  const maricopaWsUrl = data?.vncWsUrl || getWsFallbackUrl(6080);
  const buildingConnectedWsUrl = bcStatus?.vncWsUrl || getWsFallbackUrl(6081);

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
        if (!options?.silentSuccess) toast.success(successMessage);
        await mutate();
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError);
        toast.error(message);
      } finally {
        setAction(null);
      }
    },
    [mutate]
  );

  // --- Auto-ensure on first visible ---
  useEffect(() => {
    if (!visible || activePortal !== "maricopa" || autoEnsureAttempted.current) return;
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
  const { label: sessionLabel, dotClass: sessionDotClass } = getSessionDisplay(data);
  const { label: bcSessionLabel, dotClass: bcSessionDotClass } =
    getBuildingConnectedSessionDisplay(bcStatus);

  const homePinAvailable =
    (data?.lastPortalPinAt ?? null) !== null ||
    typeof data?.portalHomePinEnabled === "boolean";

  let homePinLabel = "N/A";
  if (homePinAvailable && data?.portalHomePinEnabled) {
    homePinLabel = `On (${Math.round((data.portalHomePinIntervalMs || 0) / 1000)}s)`;
  } else if (homePinAvailable) {
    homePinLabel = "Off";
  }

  const telemetry = {
    busy: data?.busy ? data.currentOperation || "Running" : "Idle",
    lastLogin: formatTimestamp(data?.lastLoginAt ?? null),
    lastKeepAlive: formatTimestamp(data?.lastKeepAliveAt ?? null),
    lastPinnedHome: homePinAvailable ? formatTimestamp(data?.lastPortalPinAt ?? null) : "N/A",
    keepAlive: data?.keepAliveEnabled
      ? `On (${Math.round((data.keepAliveIntervalMs || 0) / 1000)}s)`
      : "Off",
    homePin: homePinLabel,
  };

  const actionPending = action !== null;
  const activeActionKey = action?.split("/").pop() ?? null;

  // --- Determine active VNC ref and URL ---
  const activeVncRef = activePortal === "maricopa" ? maricopaVncRef : buildingConnectedVncRef;
  const activeWsUrl = activePortal === "maricopa" ? maricopaWsUrl : buildingConnectedWsUrl;
  const vncHealthy =
    activePortal === "maricopa"
      ? (data?.portalReady ?? false)
      : Boolean(bcStatus?.stateExists);
  const vncStatusLabel =
    activePortal === "maricopa"
      ? data?.portalReady
        ? "Portal ready"
        : "Portal not ready"
      : bcStatus?.running
        ? "Auth run in progress"
        : bcStatus?.stateExists
          ? "State file ready"
          : "Auth session idle";

  const rootClassName = visible
    ? "relative h-full w-full"
    : "pointer-events-none fixed inset-0 -z-10 opacity-0";

  return (
    <div aria-hidden={!visible} className={rootClassName}>
      {/* VNC fills entire surface */}
      <VncPanel
        aspectRatio="auto"
        healthy={vncHealthy}
        onClipboard={writeToClipboard}
        ref={activeVncRef}
        statusLabel={vncStatusLabel}
        wsUrl={activeWsUrl}
      />

      {/* Floating toolbar */}
      <AutomationToolbar
        activeAction={activeActionKey}
        activePortal={activePortal}
        actionPending={actionPending}
        buildingConnectedDotClass={bcSessionDotClass}
        buildingConnectedLabel={bcSessionLabel}
        error={activePortal === "maricopa" ? error ?? null : bcError ?? null}
        lastError={
          activePortal === "maricopa" ? (data?.lastError ?? null) : (bcStatus?.lastError ?? null)
        }
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
```

**Key differences from old version:**
- No `PageHeader`, no `p-6 lg:p-8` wrapper, no status card, no tab buttons
- Root is `relative h-full w-full` — fills the SidebarInset
- VNC gets `aspectRatio="auto"` (new prop — see Task 4) so it fills 100% instead of maintaining a fixed ratio
- Portal switching uses local `useState` instead of `useNavigate`
- BuildingConnected log tail section removed (was rarely used; can be added back as a floating panel later)
- BuildingConnected start/stop buttons should be added to the toolbar in a follow-up task

**Step 2: Verify the page renders**

Load `/automation` in the browser. Expected: VNC fills the entire content area, floating toolbar visible at top.

**Step 3: Commit**

```bash
git add apps/web/frontend/pages/automation.tsx
git commit -m "feat: rewrite automation page to full-bleed VNC layout with floating toolbar"
```

---

### Task 4: Update VncPanel to support `aspectRatio="auto"`

**Files:**
- Modify: `apps/web/frontend/components/vnc-panel.tsx:18-25,51-55`

**Step 1: Support "auto" aspect ratio**

The VNC panel currently uses a CSS `aspectRatio` style to maintain proportions. For the full-bleed layout, we need it to fill 100% of its parent instead.

In `vnc-panel.tsx`, update the container div's style logic:

Change the `VncPanelProps` interface to allow `"auto"`:

```tsx
interface VncPanelProps {
  aspectRatio: string;  // CSS aspect-ratio value, or "auto" for 100% fill
  // ... rest unchanged
}
```

Change the container div (line 51-55) from:

```tsx
<div
  className="relative w-full overflow-hidden rounded-2xl border border-border bg-black"
  style={{ aspectRatio }}
>
```

To:

```tsx
<div
  className={`relative overflow-hidden bg-black ${
    aspectRatio === "auto"
      ? "h-full w-full"
      : "w-full rounded-2xl border border-border"
  }`}
  style={aspectRatio === "auto" ? undefined : { aspectRatio }}
>
```

When `aspectRatio="auto"`, the panel fills 100% width and height of its parent with no border/rounding (since it IS the page). When a specific ratio is passed, the existing behavior is preserved.

**Step 2: Verify both modes work**

- Full-bleed mode: `/automation` — VNC fills entire area
- Existing aspect-ratio mode: verify nothing else uses VncPanel (only automation.tsx does)

**Step 3: Commit**

```bash
git add apps/web/frontend/components/vnc-panel.tsx
git commit -m "feat: support aspectRatio='auto' in VncPanel for full-bleed mode"
```

---

### Task 5: Clean up unused imports and routes

**Files:**
- Modify: `apps/web/frontend/app.tsx:82-86,168-178`

**Step 1: Simplify `isAutomationPortalPath`**

The function at lines 81-87 already handles all three paths. No change needed.

**Step 2: Clean up route definitions**

The three placeholder routes (`maricopa`, `automation`, `buildingconnected`) at lines 168-178 can stay as-is — they're `PlaceholderRoute` components that render nothing (the `AutomationPage` is always-mounted outside `Outlet`). No change needed for correct behavior.

**Step 3: Remove unused imports from automation.tsx**

Verify that these old imports are no longer used and remove if present:
- `PageHeader` — removed in Task 3
- `useNavigate` — replaced by local state in Task 3
- `ActionButtons` — inlined into toolbar

**Step 4: Run linter**

Run: `bun x ultracite fix`
Expected: Auto-fixes any formatting issues from the new code.

**Step 5: Commit**

```bash
git add -u
git commit -m "chore: clean up unused imports after automation page rewrite"
```

---

### Task 6: Visual verification and polish

**Files:**
- Possibly tweak: `automation-toolbar.tsx`, `vnc-panel.tsx`, `automation.tsx`

**Step 1: Test Maricopa portal view**

Navigate to `/automation`. Verify:
- VNC panel fills entire content area (sidebar visible, no header/padding)
- Floating toolbar at top with status dot, portal switcher, action buttons
- Click status dot — telemetry popover appears
- Click portal switcher — can switch to BuildingConnected
- Action buttons work (Ensure Ready, Keep Alive, Stop)
- Error banners appear below toolbar if permit-worker is down
- Ctrl/Cmd+V clipboard paste works

**Step 2: Test BuildingConnected view**

Switch to BuildingConnected in the toolbar. Verify:
- VNC panel switches to BC WebSocket URL
- Status dot shows BC status
- Action buttons hidden (Maricopa-only for now)

**Step 3: Test deep links**

Navigate directly to `/maricopa` — should show Maricopa view.
Navigate directly to `/buildingconnected` — should show BuildingConnected view.
Navigate to `/automation` — should default to Maricopa.

**Step 4: Test sidebar**

Verify single "Automation" item in sidebar. Clicking it goes to `/automation`.

**Step 5: Test checkpoint banner**

If a checkpoint is active (or simulate one), verify it floats above the VNC status badge at the bottom.

**Step 6: Test hidden state**

Navigate to any other page (e.g., `/estimates`). The automation page should be hidden but VNC connection preserved. Navigate back — VNC should still be connected.

**Step 7: Final commit**

```bash
git add -u
git commit -m "feat: full-bleed VNC automation page with floating controls

Replaces the chrome-heavy automation layout with a map-style full-bleed
VNC panel. Status, actions, and telemetry float as overlays. Sidebar
consolidated to single Automation entry."
```
