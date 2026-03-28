import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button";

export const NotFoundRoute = () => (
  <section className="flex flex-1 items-center justify-center">
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm">
      <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
        Not found
      </p>
      <h1 className="mt-3 font-heading font-semibold text-3xl tracking-tight">
        This route has not been mapped yet.
      </h1>
      <p className="mt-3 text-muted-foreground">
        We are building the new frontend around the main workspace surfaces one
        section at a time.
      </p>
      <div className="mt-6">
        <Link className={buttonVariants()} to="/projects">
          Return to projects
        </Link>
      </div>
    </div>
  </section>
);
