import {
  Archive,
  BarChart3,
  Clock,
  FileCheck2,
  FolderKanban,
  Inbox,
  Layers,
  Plus,
  ShieldAlert,
  Wind,
} from "lucide-react";
import type { ElementType } from "react";
import type { ViewMode } from "../types";

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  inboxCount?: number;
  archiveCount?: number;
}

interface NavItemProps {
  icon: ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

const NavItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  count,
}: NavItemProps) => (
  <button
    className={`group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
      active
        ? "bg-ink text-white shadow-sm"
        : "text-ink-muted hover:bg-surface-sunken"
    }`}
    onClick={onClick}
    type="button"
  >
    <Icon
      className={
        active
          ? "text-white"
          : "text-ink-subtle transition-colors group-hover:text-ink-muted"
      }
      size={16}
      strokeWidth={active ? 2 : 1.5}
    />
    <span
      className={`flex-1 text-[13px] ${active ? "font-semibold" : "font-medium"}`}
    >
      {label}
    </span>
    {count !== undefined && (
      <span
        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
          active
            ? "bg-white/20 text-white"
            : "bg-surface-sunken text-ink-subtle"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const Sidebar = ({
  currentView,
  onViewChange,
  inboxCount = 0,
  archiveCount = 0,
}: SidebarProps) => {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-border border-r bg-surface-raised">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-border border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-ink">
          <Layers className="text-accent" size={16} />
        </div>
        <span className="font-bold text-[16px] text-ink uppercase tracking-tight">
          ConstructFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-8 overflow-y-auto p-4">
        <div>
          <p className="section-label mb-3 px-3">Mailboxes</p>
          <div className="space-y-1">
            <NavItem
              active={currentView === "triage"}
              count={inboxCount > 0 ? inboxCount : undefined}
              icon={Inbox}
              label="Inbox"
              onClick={() => onViewChange("triage")}
            />
            <NavItem
              active={false}
              count={4}
              icon={FileCheck2}
              label="Contracts"
              onClick={() => {
                /* TODO: implement */
              }}
            />
            <NavItem
              active={false}
              icon={Wind}
              label="Dust Permits"
              onClick={() => {
                /* TODO: implement */
              }}
            />
          </div>
        </div>

        <div>
          <p className="section-label mb-3 px-3">Workspace</p>
          <div className="space-y-1">
            <NavItem
              active={currentView === "projects"}
              icon={FolderKanban}
              label="Projects"
              onClick={() => onViewChange("projects")}
            />
            <NavItem
              active={currentView === "analytics"}
              icon={BarChart3}
              label="Analytics"
              onClick={() => onViewChange("analytics")}
            />
          </div>
        </div>

        <div>
          <p className="section-label mb-3 px-3">System</p>
          <div className="space-y-1">
            <NavItem
              active={false}
              icon={Clock}
              label="History"
              onClick={() => {
                /* TODO: implement */
              }}
            />
            <NavItem
              active={false}
              count={12}
              icon={ShieldAlert}
              label="Unlinked"
              onClick={() => {
                /* TODO: implement */
              }}
            />
            <NavItem
              active={currentView === "archive"}
              count={archiveCount > 0 ? archiveCount : undefined}
              icon={Archive}
              label="Archive"
              onClick={() => onViewChange("archive")}
            />
          </div>
        </div>
      </nav>

      {/* Footer action */}
      <div className="border-border border-t bg-surface-panel p-4">
        <button
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent font-semibold text-[13px] text-white shadow-sm transition-all hover:bg-accent-bright"
          onClick={() => console.log("New Workflow Triggered")}
          type="button"
        >
          <Plus size={16} strokeWidth={2.5} />
          New Workflow
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
