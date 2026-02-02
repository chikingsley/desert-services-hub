/**
 * Pipeline progress stats bar - the momentum tracker.
 * Shows completion progress, contracts processed, and current streak.
 */
import { CheckCircle, Flame, TrendingUp, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PipelineContract } from "./types";

interface PipelineStatsProps {
  contracts: PipelineContract[];
}

function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (ref.current !== null) {
      cancelAnimationFrame(ref.current);
    }
    const start = displayed;
    const diff = value - start;
    const duration = 600;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayed(Math.round(start + diff * eased));
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };
    ref.current = requestAnimationFrame(animate);
    return () => {
      if (ref.current !== null) {
        cancelAnimationFrame(ref.current);
      }
    };
  }, [value, displayed]);

  return (
    <span>
      {displayed}
      {suffix}
    </span>
  );
}

export function PipelineStats({ contracts }: PipelineStatsProps) {
  const total = contracts.length;
  const done = contracts.filter((c) => c.stage === "done").length;
  const reconciled = contracts.filter(
    (c) => c.stage === "reconciled" || c.stage === "done"
  ).length;
  const withIssues = contracts.filter((c) =>
    c.flags.some((f) => f.severity === "error")
  ).length;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* Progress */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-bold font-display text-2xl tracking-tight">
              <AnimatedNumber suffix="%" value={percentage} />
            </div>
            <div className="truncate text-muted-foreground text-xs">
              Complete
            </div>
          </div>
        </div>
        {/* Mini progress bar */}
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Done count */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-emerald-500/30">
        <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold font-display text-2xl tracking-tight">
              <AnimatedNumber value={done} />
              <span className="text-muted-foreground text-sm">/{total}</span>
            </div>
            <div className="truncate text-muted-foreground text-xs">
              Processed
            </div>
          </div>
        </div>
      </div>

      {/* Reconciled */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-violet-500/30">
        <div className="absolute inset-0 bg-linear-to-br from-violet-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Zap className="h-5 w-5 text-violet-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold font-display text-2xl tracking-tight">
              <AnimatedNumber value={reconciled} />
            </div>
            <div className="truncate text-muted-foreground text-xs">
              Reconciled
            </div>
          </div>
        </div>
      </div>

      {/* Issues */}
      <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-amber-500/30">
        <div className="absolute inset-0 bg-linear-to-br from-amber-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Flame className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="font-bold font-display text-2xl tracking-tight">
              <AnimatedNumber value={withIssues} />
            </div>
            <div className="truncate text-muted-foreground text-xs">
              Need Attention
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
