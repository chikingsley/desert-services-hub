import {
  Activity,
  Calendar,
  ChevronRight,
  FolderKanban,
  Plus,
  User,
} from "lucide-react";
import type { Project } from "../types";

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
}

const statusColors: Record<Project["status"], string> = {
  Active: "bg-success/10 text-success border-success/20",
  "In Review": "bg-info/10 text-info border-info/20",
  Permitting: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-ink/10 text-ink-muted border-ink/10",
};

const ProjectList = ({ projects, onSelectProject }: ProjectListProps) => {
  return (
    <div className="flex-1 overflow-y-auto bg-grid p-8">
      {/* Header */}
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink">
              <FolderKanban className="text-accent" size={22} />
            </div>
            <div>
              <h1 className="font-bold text-2xl text-ink tracking-tight">
                Projects
              </h1>
              <p className="font-medium text-[13px] text-ink-dim">
                {projects.length} active projects
              </p>
            </div>
          </div>
          <button
            className="flex h-10 items-center gap-2 rounded-lg bg-ink px-5 font-bold text-[13px] text-white shadow-md transition-all hover:bg-ink-muted"
            type="button"
          >
            <Plus size={16} strokeWidth={2.5} />
            New Project
          </button>
        </div>

        {/* Project Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <button
                className="industrial-card group rounded-xl p-6 text-left transition-all hover:border-accent"
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                type="button"
              >
                {/* Header */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-[10px] text-ink-dim">
                        #{project.id.toUpperCase()}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 font-bold text-[10px] ${statusColors[project.status]}`}
                      >
                        {project.status}
                      </span>
                    </div>
                    <h3 className="truncate font-bold text-[15px] text-ink transition-colors group-hover:text-accent">
                      {project.name}
                    </h3>
                  </div>
                  <ChevronRight
                    className="mt-1 shrink-0 text-ink-dim transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                    size={16}
                  />
                </div>

                {/* Client */}
                <div className="mb-4 flex items-center gap-2 text-[12px] text-ink-muted">
                  <User className="text-ink-dim" size={12} />
                  {project.client}
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-bold text-[10px] text-ink-dim uppercase tracking-wider">
                      Progress
                    </span>
                    <span className="font-bold font-mono text-[11px] text-ink">
                      {project.progress}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-border border-t pt-4">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <Calendar size={11} />
                    <span className="font-mono">{project.startDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <Activity className="text-success" size={11} />
                    <span>{project.lastActivity}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-sunken">
              <FolderKanban className="text-ink-dim" size={28} />
            </div>
            <p className="mb-1 font-medium text-[15px] text-ink-muted">
              No projects found
            </p>
            <p className="text-[13px] text-ink-dim">
              Try adjusting your search or create a new project
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectList;
