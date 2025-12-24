import { Download, Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type EditorToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  lastSavedAt: number | null;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
};

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) {
    return "Not saved";
  }

  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 5) {
    return "Saved just now";
  }
  if (seconds < 60) {
    return `Saved ${seconds}s ago`;
  }
  if (minutes < 60) {
    return `Saved ${minutes}m ago`;
  }
  if (hours < 24) {
    return `Saved ${hours}h ago`;
  }
  return `Saved ${Math.floor(hours / 24)}d ago`;
}

export function EditorToolbar({
  canUndo,
  canRedo,
  lastSavedAt,
  onUndo,
  onRedo,
  onExport,
}: EditorToolbarProps) {
  // Force re-render every 10s to update relative time
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="z-20 flex h-14 shrink-0 items-center justify-between border-slate-200 border-b bg-white px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-slate-400">
          <button
            className={cn(
              "rounded-lg p-2 transition-colors",
              canUndo
                ? "text-slate-600 hover:bg-slate-100"
                : "cursor-not-allowed opacity-50"
            )}
            disabled={!canUndo}
            onClick={onUndo}
            type="button"
          >
            <Undo2 size={18} />
          </button>
          <button
            className={cn(
              "rounded-lg p-2 transition-colors",
              canRedo
                ? "text-slate-600 hover:bg-slate-100"
                : "cursor-not-allowed opacity-50"
            )}
            disabled={!canRedo}
            onClick={onRedo}
            type="button"
          >
            <Redo2 size={18} />
          </button>
        </div>
        <div className="mx-2 h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              lastSavedAt ? "bg-emerald-500" : "bg-slate-300"
            )}
          />
          {formatRelativeTime(lastSavedAt)}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="rounded-lg px-3 py-1.5 font-medium text-slate-600 text-sm transition-colors hover:bg-slate-100"
          type="button"
        >
          Feedback
        </button>
        <button
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-1.5 font-medium text-sm text-white shadow-sm transition-colors hover:bg-slate-800"
          onClick={onExport}
          type="button"
        >
          <Download size={16} /> Export
        </button>
      </div>
    </header>
  );
}

export default EditorToolbar;
