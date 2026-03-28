const dustPermitFocusAreas = [
  "Permit search, status, and renewal support",
  "Project-linked permit context instead of isolated portal glue",
  "A separate migration track for Maricopa automation and remote browser tooling",
] as const;

export const DustPermitsRoute = () => (
  <div className="flex flex-1 flex-col gap-6">
    <section className="rounded-3xl border border-border bg-card p-8 shadow-sm lg:p-10">
      <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
        Route scaffold
      </p>
      <h1 className="mt-4 font-heading font-semibold text-4xl tracking-tight">
        Dust Permits
      </h1>
      <p className="mt-4 max-w-3xl text-base text-muted-foreground lg:text-lg">
        This section is reserved for the permit-facing workspace. The product
        view can live here, while the heavier Maricopa automation stack remains
        a separate subsystem until we deliberately migrate it.
      </p>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-heading font-semibold text-2xl tracking-tight">
        First-pass focus
      </h2>
      <ul className="mt-4 space-y-3 text-muted-foreground text-sm leading-6">
        {dustPermitFocusAreas.map((area) => (
          <li className="rounded-2xl bg-muted/50 px-4 py-3" key={area}>
            {area}
          </li>
        ))}
      </ul>
    </section>
  </div>
);
