import type { ElementType } from 'react';
import {
  Inbox,
  FolderKanban,
  BarChart3,
  FileCheck2,
  Wind,
  Clock,
  ShieldAlert,
  Archive,
  Plus,
  Layers
} from 'lucide-react';
import type { ViewMode } from '../types';

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

const NavItem = ({ icon: Icon, label, active, onClick, count }: NavItemProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-left group ${active
        ? 'bg-ink text-white shadow-sm'
        : 'text-ink-muted hover:bg-surface-sunken'
      }`}
  >
    <Icon
      size={16}
      strokeWidth={active ? 2 : 1.5}
      className={active ? 'text-white' : 'text-ink-subtle group-hover:text-ink-muted transition-colors'}
    />
    <span className={`text-[13px] flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    {count !== undefined && (
      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${active ? 'bg-white/20 text-white' : 'bg-surface-sunken text-ink-subtle'
        }`}>
        {count}
      </span>
    )}
  </button>
);

const Sidebar = ({ currentView, onViewChange, inboxCount = 0, archiveCount = 0 }: SidebarProps) => {
  return (
    <aside className="w-60 border-r border-border h-full flex flex-col bg-surface-raised shrink-0">
      {/* Logo */}
      <div className="h-14 px-5 flex items-center gap-3 border-b border-border">
        <div className="w-8 h-8 bg-ink rounded flex items-center justify-center">
          <Layers size={16} className="text-accent" />
        </div>
        <span className="text-[16px] font-bold text-ink tracking-tight uppercase">ConstructFlow</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-8">
        <div>
          <p className="section-label px-3 mb-3">Mailboxes</p>
          <div className="space-y-1">
            <NavItem
              icon={Inbox}
              label="Inbox"
              active={currentView === 'triage'}
              onClick={() => onViewChange('triage')}
              count={inboxCount > 0 ? inboxCount : undefined}
            />
            <NavItem
              icon={FileCheck2}
              label="Contracts"
              active={false}
              onClick={() => {}}
              count={4}
            />
            <NavItem
              icon={Wind}
              label="Dust Permits"
              active={false}
              onClick={() => {}}
            />
          </div>
        </div>

        <div>
          <p className="section-label px-3 mb-3">Workspace</p>
          <div className="space-y-1">
            <NavItem
              icon={FolderKanban}
              label="Projects"
              active={currentView === 'projects'}
              onClick={() => onViewChange('projects')}
            />
            <NavItem
              icon={BarChart3}
              label="Analytics"
              active={currentView === 'analytics'}
              onClick={() => onViewChange('analytics')}
            />
          </div>
        </div>

        <div>
          <p className="section-label px-3 mb-3">System</p>
          <div className="space-y-1">
            <NavItem icon={Clock} label="History" active={false} onClick={() => {}} />
            <NavItem icon={ShieldAlert} label="Unlinked" active={false} onClick={() => {}} count={12} />
            <NavItem
              icon={Archive}
              label="Archive"
              active={currentView === 'archive'}
              onClick={() => onViewChange('archive')}
              count={archiveCount > 0 ? archiveCount : undefined}
            />
          </div>
        </div>
      </nav>

      {/* Footer action */}
      <div className="p-4 border-t border-border bg-surface-panel">
        <button
          type="button"
          onClick={() => console.log('New Workflow Triggered')}
          className="w-full flex items-center justify-center gap-2 h-10 bg-accent text-white rounded-md text-[13px] font-semibold hover:bg-accent-bright shadow-sm transition-all"
        >
          <Plus size={16} strokeWidth={2.5} />
          New Workflow
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
