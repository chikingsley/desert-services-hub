import {
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  RefreshCw,
  Square,
} from "lucide-react";
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
  actionPending: boolean;
  activeAction: string | null;
  activePortal: AutomationPortal;
  buildingConnectedDotClass?: string;
  buildingConnectedLabel?: string;
  error: Error | null;
  lastError: string | null;
  onEnsureReady: () => void;
  onKeepAlive: () => void;
  onPortalChange: (portal: AutomationPortal) => void;
  onStop: () => void;
  sessionDotClass: string;
  sessionLabel: string;
  telemetry: {
    busy: string;
    lastLogin: string;
    lastKeepAlive: string;
    lastPinnedHome: string;
    keepAlive: string;
    homePin: string;
  };
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
    <div className="pointer-events-none flex flex-col gap-2">
      {/* Main toolbar */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
        {/* Left: status indicator with telemetry popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              className="gap-2 border-0 bg-transparent text-sm text-white/90 hover:bg-white/10"
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
              <div className="mb-1 font-medium text-[11px] text-white/60 uppercase tracking-wider">
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

        {/* Portal switcher */}
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
          {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+V to paste
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

      {/* Error banners */}
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
