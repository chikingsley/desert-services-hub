import { createSearchParams, Link, useSearchParams } from "react-router";

import type { WorkspaceProject } from "@/features/projects/project-model";
import {
  getWorkflowSnapshot,
  getWorkflowStatusLabel,
  getWorkflowTone,
  hasNeedsAction,
  workflowFieldLabels,
  workflowFields,
} from "@/features/projects/workflow";
import type { WorkflowField } from "@/features/projects/workflow";
import {
  formatCurrency,
  formatDateTime,
  formatDisplay,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

type ProjectView = "all" | "needs_action" | "permits";

interface ProjectsWorkspaceProps {
  projects: WorkspaceProject[];
}

const viewOptions: { label: string; value: ProjectView }[] = [
  { label: "All projects", value: "all" },
  { label: "Needs action", value: "needs_action" },
  { label: "Permit work", value: "permits" },
];

const getProjectView = (value: string | null): ProjectView =>
  value === "needs_action" || value === "permits" ? value : "all";

const getProjectSnapshot = (project: WorkspaceProject) =>
  getWorkflowSnapshot({
    contractStatus: project.contractStatus,
    dustStatus: project.dustPermitStatus,
    noiStatus: project.noiStatus,
    safetyStatus: project.safetyStatus,
  });

const getRawWorkflowStatus = (
  project: WorkspaceProject,
  field: WorkflowField
): string | null => {
  if (field === "contract") {
    return project.contractStatus;
  }
  if (field === "dust_permit") {
    return project.dustPermitStatus;
  }
  if (field === "safety") {
    return project.safetyStatus;
  }
  return project.noiStatus;
};

const filterProjects = (
  projects: WorkspaceProject[],
  activeView: ProjectView
): WorkspaceProject[] => {
  if (activeView === "needs_action") {
    return projects.filter((project) =>
      hasNeedsAction(getProjectSnapshot(project))
    );
  }

  if (activeView === "permits") {
    return projects.filter((project) => {
      const snapshot = getProjectSnapshot(project);
      return snapshot.dust_permit !== "n_a" || snapshot.noi !== "done";
    });
  }

  return projects;
};

const getSummaryStats = (projects: WorkspaceProject[]) => {
  const totalDocumentCount = projects.reduce(
    (sum, project) => sum + project.documentCount,
    0
  );
  const totalEmailCount = projects.reduce(
    (sum, project) => sum + project.emailCount,
    0
  );

  return [
    {
      label: "Projects",
      value: String(projects.length),
    },
    {
      label: "Needs action",
      value: String(
        projects.filter((project) =>
          hasNeedsAction(getProjectSnapshot(project))
        ).length
      ),
    },
    {
      label: "Linked docs",
      value: String(totalDocumentCount),
    },
    {
      label: "Linked emails",
      value: String(totalEmailCount),
    },
  ] as const;
};

const getSearchString = (
  searchParams: URLSearchParams,
  updates: Record<string, string | null>
): string => {
  const next = new URLSearchParams(searchParams);

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  return `?${createSearchParams(next).toString()}`;
};

const workflowFieldOrder = workflowFields.filter(
  (field): field is WorkflowField => field !== undefined
);

export const ProjectsWorkspace = ({ projects }: ProjectsWorkspaceProps) => {
  const [searchParams] = useSearchParams();
  const activeView = getProjectView(searchParams.get("view"));
  const filteredProjects = filterProjects(projects, activeView);
  const selectedProjectId = Number.parseInt(
    searchParams.get("project") ?? "",
    10
  );
  const selectedProject =
    filteredProjects.find(
      (project) => project.projectId === selectedProjectId
    ) ??
    filteredProjects[0] ??
    null;
  const selectedSnapshot = selectedProject
    ? getProjectSnapshot(selectedProject)
    : null;
  const summaryStats = getSummaryStats(projects);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryStats.map((stat) => (
          <article
            className="rounded-2xl border border-border bg-card p-5 shadow-md shadow-black/5"
            key={stat.label}
          >
            <p className="text-muted-foreground text-sm">{stat.label}</p>
            <p className="mt-3 font-heading font-semibold text-3xl tracking-tight">
              {stat.value}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-md shadow-black/5 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
              Projects
            </p>
            <div>
              <h1 className="font-heading font-semibold text-4xl tracking-tight">
                Project workspace
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Sample data is shaped from the real project, estimate, document,
                and email relationships so we can tighten the product model
                before wiring live APIs.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {viewOptions.map((option) => {
              const isActive = option.value === activeView;

              return (
                <Link
                  className={cn(
                    "rounded-full border px-3 py-2 font-medium text-sm transition-colors",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                  key={option.value}
                  to={getSearchString(searchParams, {
                    project: selectedProject?.projectId
                      ? String(selectedProject.projectId)
                      : null,
                    view: option.value === "all" ? null : option.value,
                  })}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <div className="space-y-4">
          {filteredProjects.map((project) => {
            const snapshot = getProjectSnapshot(project);
            const isSelected = project.projectId === selectedProject?.projectId;

            return (
              <Link
                className={cn(
                  "block rounded-2xl border bg-card p-5 shadow-md shadow-black/5 transition-all",
                  isSelected
                    ? "border-foreground/60 ring-2 ring-foreground/10"
                    : "border-border hover:border-foreground/30"
                )}
                key={project.projectId}
                to={getSearchString(searchParams, {
                  project: String(project.projectId),
                })}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-heading font-semibold text-xl tracking-tight">
                      {project.projectName}
                    </p>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {formatDisplay(project.contractor)}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-muted-foreground text-xs">
                    #{project.projectId}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      Estimate
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {formatDisplay(project.estimateNumber)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      Value
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {formatCurrency(
                        project.awardedValue ?? project.bidValue ?? null
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                      Activity
                    </p>
                    <p className="mt-1 font-medium text-sm">
                      {formatDateTime(project.lastTouchAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {workflowFieldOrder.map((field) => (
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs",
                        getWorkflowTone(field, snapshot[field])
                      )}
                      key={field}
                    >
                      {workflowFieldLabels[field]}:{" "}
                      {getWorkflowStatusLabel(field, snapshot[field])}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-muted-foreground text-sm leading-6">
                  {project.nextAction}
                </p>
              </Link>
            );
          })}
        </div>

        {selectedProject && selectedSnapshot ? (
          <article className="rounded-2xl border border-border bg-card p-6 shadow-md shadow-black/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-heading font-semibold text-3xl tracking-tight">
                  {selectedProject.projectName}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {formatDisplay(selectedProject.contractor)}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 px-4 py-3">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Next action
                </p>
                <p className="mt-2 max-w-xs font-medium text-sm leading-6">
                  {selectedProject.nextAction}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Canonical estimate
                </p>
                <p className="mt-2 font-medium text-sm">
                  #{selectedProject.canonicalEstimateId ?? "—"} •{" "}
                  {formatDisplay(selectedProject.estimateNumber)}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {formatDisplay(selectedProject.estimateName)}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Bid state
                </p>
                <p className="mt-2 font-medium text-sm">
                  {formatDisplay(selectedProject.bidStatus)}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {formatCurrency(
                    selectedProject.awardedValue ?? selectedProject.bidValue
                  )}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Linked workload
                </p>
                <p className="mt-2 font-medium text-sm">
                  {selectedProject.documentCount} documents
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {selectedProject.emailCount} emails
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <h2 className="font-heading font-semibold text-2xl tracking-tight">
                  Workflow
                </h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {workflowFieldOrder.map((field) => {
                    const normalizedStatus = selectedSnapshot[field];

                    return (
                      <div
                        className="rounded-2xl border border-border bg-background p-4"
                        key={field}
                      >
                        <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                          {workflowFieldLabels[field]}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs",
                              getWorkflowTone(field, normalizedStatus)
                            )}
                          >
                            {getWorkflowStatusLabel(field, normalizedStatus)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Raw:{" "}
                            {formatDisplay(
                              getRawWorkflowStatus(selectedProject, field)
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background p-4">
                  <h3 className="font-heading font-semibold text-lg tracking-tight">
                    Linked documents
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {selectedProject.documents.map((document) => (
                      <li
                        className="rounded-2xl bg-muted/50 px-4 py-3"
                        key={document.id}
                      >
                        <p className="font-medium text-sm">
                          {document.fileName}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-border px-2 py-1">
                            {document.documentType}
                          </span>
                          <span className="rounded-full border border-border px-2 py-1">
                            {document.extractionStatus}
                          </span>
                          <span className="rounded-full border border-border px-2 py-1">
                            {document.qaStatus}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-border bg-background p-4">
                  <h3 className="font-heading font-semibold text-lg tracking-tight">
                    Linked emails
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {selectedProject.emails.map((email) => (
                      <li
                        className="rounded-2xl bg-muted/50 px-4 py-3"
                        key={email.id}
                      >
                        <p className="font-medium text-sm">{email.subject}</p>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {email.fromEmail}
                        </p>
                        <p className="mt-2 text-muted-foreground text-xs">
                          {formatDateTime(email.receivedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </article>
        ) : (
          <article className="rounded-2xl border border-dashed border-border bg-card p-6 text-muted-foreground shadow-md shadow-black/5">
            No projects matched the current view.
          </article>
        )}
      </section>
    </div>
  );
};
