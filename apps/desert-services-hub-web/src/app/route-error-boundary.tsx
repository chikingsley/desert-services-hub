import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import { buttonVariants } from "@/components/ui/button";

const getRouteErrorMessage = (data: unknown): string | null => {
  if (typeof data === "string") {
    return data;
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return null;
};

export const RouteErrorBoundary = () => {
  const error = useRouteError();

  let title = "Something went wrong";
  let detail = "The route could not be loaded.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = getRouteErrorMessage(error.data) ?? detail;
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <section className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
          Route error
        </p>
        <h1 className="mt-3 font-heading font-semibold text-3xl tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-muted-foreground">{detail}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className={buttonVariants()} to="/">
            Return home
          </Link>
        </div>
      </div>
    </section>
  );
};
