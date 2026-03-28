const emailFocusAreas = [
  "Operational inbox and project linking",
  "Email actions that attach work to projects and documents",
  "A cleaner split between inbox management and automation review tooling",
] as const;

export const EmailsRoute = () => (
  <div className="flex flex-1 flex-col gap-6">
    <section className="rounded-3xl border border-border bg-card p-8 shadow-sm lg:p-10">
      <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
        Route scaffold
      </p>
      <h1 className="mt-4 font-heading font-semibold text-4xl tracking-tight">
        Emails
      </h1>
      <p className="mt-4 max-w-3xl text-base text-muted-foreground lg:text-lg">
        This section is reserved for the operational inbox. It will likely
        become the surface for project linking, triage, and triggering actions
        from messages rather than just mirroring the old inbox page wholesale.
      </p>
    </section>

    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="font-heading font-semibold text-2xl tracking-tight">
        First-pass focus
      </h2>
      <ul className="mt-4 space-y-3 text-muted-foreground text-sm leading-6">
        {emailFocusAreas.map((area) => (
          <li className="rounded-2xl bg-muted/50 px-4 py-3" key={area}>
            {area}
          </li>
        ))}
      </ul>
    </section>
  </div>
);
