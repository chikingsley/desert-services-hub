/**
 * Shared stat card for dashboard pages.
 */
export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/80 px-4 py-3">
      <div
        className={`break-all font-display font-semibold text-2xl leading-tight ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
