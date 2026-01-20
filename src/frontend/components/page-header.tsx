import type React from "react";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  centerActions?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  centerActions,
  actions,
}: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-border/50 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-6">
      <SidebarTrigger className="-ml-1 text-muted-foreground transition-colors hover:text-foreground" />
      <Separator className="mr-2 h-5 bg-border/50" orientation="vertical" />

      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumb className="flex-1">
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${crumb.href}`}>
                {index > 0 && (
                  <BreadcrumbSeparator className="text-muted-foreground/40" />
                )}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      href={crumb.href}
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="font-display font-medium text-foreground">
                      {crumb.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5">
          <h1 className="font-display font-medium text-foreground text-sm tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground text-xs">{description}</p>
          )}
        </div>
      )}

      {centerActions && (
        <div className="flex items-center gap-1">{centerActions}</div>
      )}

      {actions && (
        <div
          className={
            centerActions
              ? "flex flex-1 items-center justify-end gap-3"
              : "ml-auto flex items-center gap-3"
          }
        >
          {actions}
        </div>
      )}
    </header>
  );
}
