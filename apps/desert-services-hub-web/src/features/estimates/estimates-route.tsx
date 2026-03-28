const estimatesFocusAreas = [
  "Estimate list, search, filters, and award state",
  "Project linkage from awarded or won estimates",
  "A cleaner split between list views and the deeper editor workspace",
] as const;

export const EstimatesRoute = () => (
  <div className="flex flex-1 flex-col gap-6">
    <section className="rounded-3xl border border-border bg-card p-8 shadow-sm lg:p-10">
      <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
        Route scaffold
      </p>
      <h1 className="mt-4 font-heading font-semibold text-4xl tracking-tight">
        Estimates
      </h1>
      <p className="mt-4 max-w-3xl text-base text-muted-foreground lg:text-lg">
        This section is reserved for estimate lifecycle work. The eventual split
        is likely list-first and workflow-first, with the heavier editor
        experience brought over only after the shell and project model settle
        down.
      </p>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-heading font-semibold text-2xl tracking-tight">
        First-pass focus
      </h2>
      <ul className="mt-4 space-y-3 text-muted-foreground text-sm leading-6">
        {estimatesFocusAreas.map((area) => (
          <li className="rounded-2xl bg-muted/50 px-4 py-3" key={area}>
            {area}
          </li>
        ))}
      </ul>
    </section>
  </div>
);
