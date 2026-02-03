import type { Project } from '../types';
import {
  FolderKanban,
  Plus,
  Activity,
  Calendar,
  User,
  ChevronRight
} from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (projectId: string) => void;
}

const statusColors: Record<Project['status'], string> = {
  'Active': 'bg-success/10 text-success border-success/20',
  'In Review': 'bg-info/10 text-info border-info/20',
  'Permitting': 'bg-warning/10 text-warning border-warning/20',
  'Completed': 'bg-ink/10 text-ink-muted border-ink/10'
};

const ProjectList = ({ projects, onSelectProject }: ProjectListProps) => {
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-grid">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center">
              <FolderKanban size={22} className="text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-ink tracking-tight">Projects</h1>
              <p className="text-[13px] text-ink-dim font-medium">{projects.length} active projects</p>
            </div>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 h-10 px-5 bg-ink text-white rounded-lg text-[13px] font-bold hover:bg-ink-muted shadow-md transition-all"
          >
            <Plus size={16} strokeWidth={2.5} />
            New Project
          </button>
        </div>

        {/* Project Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                className="industrial-card rounded-xl p-6 text-left hover:border-accent group transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-ink-dim">#{project.id.toUpperCase()}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[project.status]}`}>
                        {project.status}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-bold text-ink truncate group-hover:text-accent transition-colors">
                      {project.name}
                    </h3>
                  </div>
                  <ChevronRight size={16} className="text-ink-dim group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                </div>

                {/* Client */}
                <div className="flex items-center gap-2 text-[12px] text-ink-muted mb-4">
                  <User size={12} className="text-ink-dim" />
                  {project.client}
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-ink-dim uppercase tracking-wider">Progress</span>
                    <span className="text-[11px] font-bold font-mono text-ink">{project.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <Calendar size={11} />
                    <span className="font-mono">{project.startDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <Activity size={11} className="text-success" />
                    <span>{project.lastActivity}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto mb-4">
              <FolderKanban size={28} className="text-ink-dim" />
            </div>
            <p className="text-[15px] font-medium text-ink-muted mb-1">No projects found</p>
            <p className="text-[13px] text-ink-dim">Try adjusting your search or create a new project</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectList;
