import { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import ProjectTimeline from './components/ProjectTimeline';
import ProjectList from './components/ProjectList';
import { MOCK_PROJECTS, MOCK_TRIAGE_ITEMS, MOCK_EMAILS } from './mockData';
import type { ViewMode, TriageItem } from './types';
import type { ElementType } from 'react';
import {
  Search,
  ChevronRight,
  Sparkles,
  FileBadge,
  Send,
  Files,
  Activity,
  Plus,
  Wind,
  Bell,
  ChevronLeft,
  ArrowRight,
  LayoutGrid,
  Clock,
  ListTodo,
  Calendar,
  User,
  Check,
  Mail,
  Link2,
  CheckCircle,
  Inbox
} from 'lucide-react';

// ============================================================================
// INBOX LIST ITEM
// ============================================================================
interface InboxItemProps {
  item: TriageItem;
  isSelected: boolean;
  onSelect: () => void;
}

const InboxItem = ({ item, isSelected, onSelect }: InboxItemProps) => {
  const icons = {
    new_email: Mail,
    unlinked_doc: Files,
    project_update: Activity
  };
  const Icon = icons[item.type];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-5 py-4 border-b border-border-subtle transition-all ${
        isSelected
          ? 'bg-accent/5 border-l-4 border-l-accent'
          : 'hover:bg-surface-sunken border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isSelected ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-dim'
        }`}>
          <Icon size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className={`text-[13px] truncate ${isSelected ? 'font-bold text-ink' : 'font-medium text-ink-muted'}`}>
              {item.title}
            </span>
            <span className="font-mono text-[10px] text-ink-dim shrink-0">{item.timestamp}</span>
          </div>
          <p className="text-[12px] text-ink-dim line-clamp-1">{item.subtitle}</p>
        </div>
      </div>
    </button>
  );
};

// ============================================================================
// WORKFLOW BUTTON
// ============================================================================
interface WorkflowButtonProps {
  icon: ElementType;
  label: string;
  sublabel?: string;
}

const WorkflowButton = ({ icon: Icon, label, sublabel }: WorkflowButtonProps) => (
  <button
    type="button"
    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border bg-surface-raised hover:border-accent transition-all text-left group"
  >
    <div className="w-9 h-9 rounded-md bg-surface-sunken flex items-center justify-center text-ink-dim group-hover:bg-accent group-hover:text-white transition-colors">
      <Icon size={16} strokeWidth={1.5} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-bold text-ink group-hover:text-accent transition-colors">{label}</p>
      {sublabel && <p className="text-[11px] text-ink-dim">{sublabel}</p>}
    </div>
    <ChevronRight size={14} className="text-ink-dim" />
  </button>
);

// ============================================================================
// TAB BUTTON
// ============================================================================
interface TabButtonProps {
  icon: ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}

const TabButton = ({ icon: Icon, label, active, onClick }: TabButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-5 h-12 text-[13px] font-semibold transition-all relative ${
      active ? 'text-ink' : 'text-ink-dim hover:text-ink-muted'
    }`}
  >
    <Icon size={15} strokeWidth={active ? 2.5 : 1.5} />
    {label}
    {active && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-ink rounded-t-full" />}
  </button>
);

// ============================================================================
// MAIN APP
// ============================================================================
const App = () => {
  // View state
  const [currentView, setCurrentView] = useState<ViewMode>('triage');

  // Triage state
  const [triageItems, setTriageItems] = useState<TriageItem[]>(MOCK_TRIAGE_ITEMS);
  const [archivedItems, setArchivedItems] = useState<TriageItem[]>([]);
  const [selectedTriageItem, setSelectedTriageItem] = useState<TriageItem | null>(MOCK_TRIAGE_ITEMS[0]);

  // Projects state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'docs' | 'tasks'>('overview');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Derive active project from ID
  const activeProject = selectedProjectId
    ? MOCK_PROJECTS.find(p => p.id === selectedProjectId) ?? null
    : null;

  // Filtered data
  const filteredTriage = useMemo(() => {
    return triageItems.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [triageItems, searchQuery]);

  const filteredProjects = useMemo(() => {
    return MOCK_PROJECTS.filter(proj =>
      proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proj.client.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Handle view changes - reset relevant state
  const handleViewChange = (view: ViewMode) => {
    setCurrentView(view);
    if (view === 'projects') {
      setSelectedProjectId(null); // Show project list first
    }
  };

  // Handle triage item selection
  const handleTriageSelect = (item: TriageItem) => {
    setSelectedTriageItem(item);
  };

  // Handle linking item to project (stays in inbox, removes item)
  const handleLinkToProject = () => {
    const remaining = triageItems.filter(item => item.id !== selectedTriageItem?.id);
    setTriageItems(remaining);
    setSelectedTriageItem(remaining[0] ?? null);
  };

  // Handle skipping/dismissing item - moves to archive
  const handleSkip = () => {
    if (!selectedTriageItem) return;

    // Move to archive
    setArchivedItems(prev => [...prev, selectedTriageItem]);

    // Remove from inbox
    const remaining = triageItems.filter(item => item.id !== selectedTriageItem.id);
    setTriageItems(remaining);
    setSelectedTriageItem(remaining[0] ?? null);
  };

  // Handle project selection from list
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
  };

  // Handle back from project detail
  const handleBackToProjectList = () => {
    setSelectedProjectId(null);
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'docs', label: 'Documents', icon: Files },
    { id: 'tasks', label: 'Tasks', icon: ListTodo }
  ] as const;

  return (
    <div className="flex h-screen w-screen bg-surface overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={handleViewChange}
        inboxCount={triageItems.length}
        archiveCount={archivedItems.length}
      />

      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* HEADER */}
        <header className="h-14 bg-surface-raised border-b border-border px-8 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-6 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" size={15} />
              <input
                type="text"
                placeholder={currentView === 'triage' ? 'Search inbox...' : 'Search projects...'}
                className="w-full h-9 bg-surface-sunken border border-border rounded-lg pl-10 pr-4 text-[13px] text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button type="button" className="relative w-9 h-9 flex items-center justify-center text-ink-dim hover:text-ink hover:bg-surface-sunken rounded-lg transition-colors">
              <Bell size={18} strokeWidth={1.5} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full" />
            </button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-3">
              <img
                src="https://api.dicebear.com/7.x/notionists/svg?seed=chi"
                className="w-8 h-8 rounded-full bg-surface-sunken"
                alt="Profile"
              />
              <div className="hidden lg:block">
                <p className="text-[13px] font-semibold text-ink leading-tight">Chi Ejimofor</p>
                <p className="text-[10px] text-ink-dim">Desert Services</p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="flex-1 flex overflow-hidden">

          {/* ============================================================
              TRIAGE VIEW
          ============================================================ */}
          {currentView === 'triage' && (
            <>
              {/* Inbox Panel */}
              <div className="w-80 border-r border-border bg-surface-raised flex flex-col shrink-0">
                <div className="h-12 px-5 flex items-center justify-between border-b border-border">
                  <span className="section-label">Inbox</span>
                  <span className="font-mono text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded">
                    {filteredTriage.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTriage.length > 0 ? (
                    filteredTriage.map(item => (
                      <InboxItem
                        key={item.id}
                        item={item}
                        isSelected={selectedTriageItem?.id === item.id}
                        onSelect={() => handleTriageSelect(item)}
                      />
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 rounded-xl bg-surface-sunken flex items-center justify-center mx-auto mb-3">
                        <CheckCircle size={20} className="text-success" />
                      </div>
                      <p className="text-[13px] font-medium text-ink-muted">All caught up!</p>
                      <p className="text-[12px] text-ink-dim mt-1">No items in your inbox</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Triage Detail / Match View */}
              <div className="flex-1 flex items-center justify-center p-8 bg-grid overflow-y-auto">
                {selectedTriageItem ? (
                  <div className="w-full max-w-xl">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                        <Sparkles size={22} className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-ink">Smart Match Found</h2>
                        <p className="text-[13px] text-ink-dim">AI detected a matching estimate</p>
                      </div>
                    </div>

                    {/* Match Card */}
                    <div className="industrial-card rounded-xl overflow-hidden mb-6">
                      {/* Incoming */}
                      <div className="p-6 border-b border-border">
                        <div className="flex items-center gap-2 mb-3">
                          <Mail size={12} className="text-ink-dim" />
                          <span className="section-label">Incoming</span>
                        </div>
                        <p className="text-[15px] font-semibold text-ink mb-2">{selectedTriageItem.title}</p>
                        <p className="text-[13px] text-ink-muted leading-relaxed">
                          {selectedTriageItem.metadata?.body?.substring(0, 150)}...
                        </p>
                      </div>

                      {/* Match */}
                      <div className="p-6 bg-accent/5 border-l-4 border-l-accent">
                        <div className="flex items-center gap-2 mb-3">
                          <Link2 size={12} className="text-accent" />
                          <span className="section-label text-accent">Matched Estimate</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[15px] font-bold font-mono text-ink">#EST-2026-088</p>
                            <p className="text-[13px] text-ink-muted">Greenway Billing Hub</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold font-mono text-ink">$125,000</p>
                            <p className="text-[10px] text-accent font-semibold">98% match</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleLinkToProject}
                        className="flex-1 h-12 bg-ink text-white rounded-lg text-[14px] font-semibold hover:bg-ink-muted transition-colors flex items-center justify-center gap-2"
                      >
                        Link & Mark Won
                        <ArrowRight size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="h-12 px-6 border border-border rounded-lg text-[14px] font-medium text-ink-muted hover:bg-surface-sunken transition-colors"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto mb-4">
                      <Inbox size={28} className="text-ink-dim" />
                    </div>
                    <p className="text-[15px] font-medium text-ink-muted">Select an item</p>
                    <p className="text-[13px] text-ink-dim mt-1">Choose an item from your inbox to review</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============================================================
              PROJECTS VIEW
          ============================================================ */}
          {currentView === 'projects' && !activeProject && (
            <ProjectList
              projects={filteredProjects}
              onSelectProject={handleSelectProject}
            />
          )}

          {currentView === 'projects' && activeProject && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Project Header */}
              <div className="bg-surface-raised border-b border-border shrink-0">
                <div className="px-8 py-5 flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <button
                      type="button"
                      onClick={handleBackToProjectList}
                      className="mt-1 w-9 h-9 flex items-center justify-center rounded-lg border border-border text-ink-dim hover:text-ink hover:bg-surface-sunken transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-xl font-bold text-ink">{activeProject.name}</h1>
                        <span className="font-mono text-[11px] text-ink-dim bg-surface-sunken px-2 py-0.5 rounded">
                          #{activeProject.id.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[13px] text-ink-dim flex items-center gap-2">
                        <User size={13} />
                        {activeProject.client}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-2 h-9 px-4 bg-ink text-white rounded-lg text-[13px] font-semibold hover:bg-ink-muted transition-colors"
                  >
                    <Plus size={14} />
                    Add Action
                  </button>
                </div>

                {/* Tabs */}
                <div className="px-8 flex border-t border-border">
                  {tabs.map(tab => (
                    <TabButton
                      key={tab.id}
                      icon={tab.icon}
                      label={tab.label}
                      active={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-8 bg-grid">
                <div className="max-w-5xl">
                  {activeTab === 'overview' && (
                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 space-y-6">
                        {/* Details */}
                        <section className="industrial-card rounded-xl p-6">
                          <h3 className="section-label mb-4">Project Details</h3>
                          <p className="text-[14px] text-ink-muted leading-relaxed mb-6">{activeProject.description}</p>
                          <div className="flex gap-8 pt-4 border-t border-border">
                            <div className="flex items-center gap-3">
                              <Calendar size={16} className="text-ink-dim" />
                              <div>
                                <p className="text-[11px] text-ink-dim uppercase">Timeline</p>
                                <p className="text-[13px] font-mono font-medium text-ink">{activeProject.startDate} → {activeProject.endDate}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <User size={16} className="text-ink-dim" />
                              <div>
                                <p className="text-[11px] text-ink-dim uppercase">Client</p>
                                <p className="text-[13px] font-medium text-ink">{activeProject.client}</p>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* Estimates */}
                        <section className="industrial-card rounded-xl overflow-hidden">
                          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <h3 className="section-label">Estimates & POs</h3>
                            <span className="text-[11px] text-ink-dim">{activeProject.estimates.length} items</span>
                          </div>
                          <div className="divide-y divide-border">
                            {activeProject.estimates.map(est => (
                              <div key={est.id} className="px-6 py-4 flex items-center justify-between hover:bg-surface-sunken transition-colors cursor-pointer">
                                <div className="flex items-center gap-4">
                                  <div className={`w-2 h-2 rounded-full ${est.status === 'Won' ? 'bg-success' : 'bg-info'}`} />
                                  <div>
                                    <p className="text-[13px] font-mono font-medium text-ink">{est.number}</p>
                                    <p className="text-[11px] text-ink-dim">{est.date}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-[14px] font-mono font-semibold text-ink">{est.amount}</span>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                    est.status === 'Won' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'
                                  }`}>
                                    {est.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>

                      <div className="space-y-6">
                        {/* Status */}
                        <section className="bg-ink rounded-xl p-6 text-white">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] text-white/50 uppercase tracking-wide">Status</span>
                            <Activity size={14} className="text-success" />
                          </div>
                          <p className="text-2xl font-bold mb-1">On Track</p>
                          <p className="text-[12px] text-white/50 mb-4">Progress: {activeProject.progress}%</p>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: `${activeProject.progress}%` }} />
                          </div>
                        </section>

                        {/* Tasks */}
                        <section className="industrial-card rounded-xl p-6">
                          <h3 className="section-label mb-4">Tasks</h3>
                          <div className="space-y-3">
                            {activeProject.tasks.slice(0, 4).map(task => (
                              <div key={task.id} className="flex items-center gap-3">
                                {task.status === 'Done' ? (
                                  <Check size={14} className="text-success" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded border-2 border-border" />
                                )}
                                <span className={`text-[13px] flex-1 truncate ${
                                  task.status === 'Done' ? 'text-ink-dim line-through' : 'text-ink-muted'
                                }`}>
                                  {task.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    </div>
                  )}

                  {activeTab === 'timeline' && (
                    <div className="industrial-card rounded-xl p-6">
                      <ProjectTimeline
                        emails={MOCK_EMAILS.filter(e => e.projectId === activeProject.id)}
                        files={activeProject.files}
                      />
                    </div>
                  )}

                  {activeTab === 'docs' && (
                    <div className="grid grid-cols-3 gap-4">
                      {['Permits', 'Blueprints', 'Contracts'].map(cat => (
                        <div key={cat} className="industrial-card rounded-xl p-5 hover:border-accent cursor-pointer transition-colors group">
                          <div className="w-10 h-10 rounded-lg bg-surface-sunken flex items-center justify-center mb-3 group-hover:bg-accent/10">
                            <Files size={18} className="text-ink-dim group-hover:text-accent" />
                          </div>
                          <p className="text-[14px] font-semibold text-ink group-hover:text-accent">{cat}</p>
                          <p className="text-[12px] text-ink-dim">4 files</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'tasks' && (
                    <div className="industrial-card rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-surface-sunken">
                            <th className="px-6 py-3 text-left section-label">Status</th>
                            <th className="px-6 py-3 text-left section-label">Task</th>
                            <th className="px-6 py-3 text-left section-label">Due</th>
                            <th className="px-6 py-3 text-left section-label">Assignee</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {activeProject.tasks.map(task => (
                            <tr key={task.id} className="hover:bg-surface-sunken transition-colors">
                              <td className="px-6 py-3">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  task.status === 'Done' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                                }`}>
                                  {task.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-[13px] text-ink-muted">{task.title}</td>
                              <td className="px-6 py-3 text-[13px] font-mono text-ink-dim">{task.dueDate}</td>
                              <td className="px-6 py-3 text-[13px] text-ink-dim">{task.assignee}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              ANALYTICS VIEW (Placeholder)
          ============================================================ */}
          {currentView === 'analytics' && (
            <div className="flex-1 flex items-center justify-center bg-grid">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto mb-4">
                  <Activity size={28} className="text-ink-dim" />
                </div>
                <p className="text-[15px] font-medium text-ink-muted">Analytics Dashboard</p>
                <p className="text-[13px] text-ink-dim mt-1">Coming soon</p>
              </div>
            </div>
          )}

          {/* ============================================================
              ARCHIVE VIEW
          ============================================================ */}
          {currentView === 'archive' && (
            <div className="flex-1 overflow-y-auto p-8 bg-grid">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-xl bg-surface-sunken flex items-center justify-center">
                    <Inbox size={22} className="text-ink-dim" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-ink">Archive</h1>
                    <p className="text-[13px] text-ink-dim">{archivedItems.length} archived items</p>
                  </div>
                </div>

                {archivedItems.length > 0 ? (
                  <div className="industrial-card rounded-xl overflow-hidden divide-y divide-border">
                    {archivedItems.map(item => (
                      <div key={item.id} className="p-5 flex items-center justify-between hover:bg-surface-sunken transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-lg bg-surface-sunken flex items-center justify-center text-ink-dim">
                            <Mail size={14} />
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-ink">{item.title}</p>
                            <p className="text-[12px] text-ink-dim">{item.subtitle}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            // Restore to inbox
                            setTriageItems(prev => [...prev, item]);
                            setArchivedItems(prev => prev.filter(i => i.id !== item.id));
                          }}
                          className="text-[12px] font-medium text-accent hover:underline"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="industrial-card rounded-xl p-12 text-center">
                    <div className="w-12 h-12 rounded-xl bg-surface-sunken flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={20} className="text-ink-dim" />
                    </div>
                    <p className="text-[14px] font-medium text-ink-muted">Archive is empty</p>
                    <p className="text-[13px] text-ink-dim mt-1">Skipped items will appear here</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WORKFLOWS PANEL - Show on triage and projects views */}
          {(currentView === 'triage' || currentView === 'projects') && (
            <div className="w-64 border-l border-border bg-surface-raised flex flex-col shrink-0">
              <div className="h-12 px-5 flex items-center justify-between border-b border-border">
                <span className="section-label">Workflows</span>
                <Sparkles size={14} className="text-accent" />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-2">
                  <WorkflowButton icon={Wind} label="Dust Permit" sublabel="Auto-generate permit" />
                  <WorkflowButton icon={FileBadge} label="Draft Contract" sublabel="Create from template" />
                  <WorkflowButton icon={Send} label="Billing Check" sublabel="Reconcile invoices" />
                </div>

                {activeProject && (
                  <div>
                    <p className="section-label mb-3">Activity</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                        <div>
                          <p className="text-[12px] text-ink-muted">New PO Linked</p>
                          <p className="text-[10px] text-ink-dim font-mono">2h ago</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-border mt-1.5" />
                        <div>
                          <p className="text-[12px] text-ink-muted">Billing reconciled</p>
                          <p className="text-[10px] text-ink-dim font-mono">6h ago</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
