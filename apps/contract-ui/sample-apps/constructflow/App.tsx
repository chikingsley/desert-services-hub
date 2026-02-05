import {
  Activity,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileBadge,
  Files,
  Inbox,
  LayoutGrid,
  Link2,
  ListTodo,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
  User,
  Wind,
} from "lucide-react";
import type { ElementType } from "react";
import { useMemo, useState } from "react";
import ProjectList from "./components/ProjectList";
import ProjectTimeline from "./components/ProjectTimeline";
import Sidebar from "./components/Sidebar";
import { MOCK_EMAILS, MOCK_PROJECTS, MOCK_TRIAGE_ITEMS } from "./mockData";
import type { TriageItem, ViewMode } from "./types";

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
    project_update: Activity,
  };
  const Icon = icons[item.type];

  return (
    <button
      className={`w-full border-border-subtle border-b px-5 py-4 text-left transition-all ${
        isSelected
          ? "border-l-4 border-l-accent bg-accent/5"
          : "border-l-4 border-l-transparent hover:bg-surface-sunken"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start gap-4">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isSelected
              ? "bg-accent text-white"
              : "bg-surface-sunken text-ink-dim"
          }`}
        >
          <Icon size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-[13px] ${isSelected ? "font-bold text-ink" : "font-medium text-ink-muted"}`}
            >
              {item.title}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-dim">
              {item.timestamp}
            </span>
          </div>
          <p className="line-clamp-1 text-[12px] text-ink-dim">
            {item.subtitle}
          </p>
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

const WorkflowButton = ({
  icon: Icon,
  label,
  sublabel,
}: WorkflowButtonProps) => (
  <button
    className="group flex w-full items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-3 text-left transition-all hover:border-accent"
    type="button"
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-sunken text-ink-dim transition-colors group-hover:bg-accent group-hover:text-white">
      <Icon size={16} strokeWidth={1.5} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="font-bold text-[13px] text-ink transition-colors group-hover:text-accent">
        {label}
      </p>
      {sublabel && <p className="text-[11px] text-ink-dim">{sublabel}</p>}
    </div>
    <ChevronRight className="text-ink-dim" size={14} />
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
    className={`relative flex h-12 items-center gap-2 px-5 font-semibold text-[13px] transition-all ${
      active ? "text-ink" : "text-ink-dim hover:text-ink-muted"
    }`}
    onClick={onClick}
    type="button"
  >
    <Icon size={15} strokeWidth={active ? 2.5 : 1.5} />
    {label}
    {active && (
      <div className="absolute right-4 bottom-0 left-4 h-0.5 rounded-t-full bg-ink" />
    )}
  </button>
);

// ============================================================================
// MAIN APP
// ============================================================================
const App = () => {
  // View state
  const [currentView, setCurrentView] = useState<ViewMode>("triage");

  // Triage state
  const [triageItems, setTriageItems] =
    useState<TriageItem[]>(MOCK_TRIAGE_ITEMS);
  const [archivedItems, setArchivedItems] = useState<TriageItem[]>([]);
  const [selectedTriageItem, setSelectedTriageItem] =
    useState<TriageItem | null>(MOCK_TRIAGE_ITEMS[0]);

  // Projects state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<
    "overview" | "timeline" | "docs" | "tasks"
  >("overview");

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Derive active project from ID
  const activeProject = selectedProjectId
    ? (MOCK_PROJECTS.find((p) => p.id === selectedProjectId) ?? null)
    : null;

  // Filtered data
  const filteredTriage = useMemo(() => {
    return triageItems.filter(
      (item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [triageItems, searchQuery]);

  const filteredProjects = useMemo(() => {
    return MOCK_PROJECTS.filter(
      (proj) =>
        proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proj.client.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Handle view changes - reset relevant state
  const handleViewChange = (view: ViewMode) => {
    setCurrentView(view);
    if (view === "projects") {
      setSelectedProjectId(null); // Show project list first
    }
  };

  // Handle triage item selection
  const handleTriageSelect = (item: TriageItem) => {
    setSelectedTriageItem(item);
  };

  // Handle linking item to project (stays in inbox, removes item)
  const handleLinkToProject = () => {
    const remaining = triageItems.filter(
      (item) => item.id !== selectedTriageItem?.id
    );
    setTriageItems(remaining);
    setSelectedTriageItem(remaining[0] ?? null);
  };

  // Handle skipping/dismissing item - moves to archive
  const handleSkip = () => {
    if (!selectedTriageItem) {
      return;
    }

    // Move to archive
    setArchivedItems((prev) => [...prev, selectedTriageItem]);

    // Remove from inbox
    const remaining = triageItems.filter(
      (item) => item.id !== selectedTriageItem.id
    );
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
    { id: "overview", label: "Overview", icon: LayoutGrid },
    { id: "timeline", label: "Timeline", icon: Clock },
    { id: "docs", label: "Documents", icon: Files },
    { id: "tasks", label: "Tasks", icon: ListTodo },
  ] as const;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <Sidebar
        archiveCount={archivedItems.length}
        currentView={currentView}
        inboxCount={triageItems.length}
        onViewChange={handleViewChange}
      />

      <main className="flex h-full min-w-0 flex-1 flex-col">
        {/* HEADER */}
        <header className="z-10 flex h-14 shrink-0 items-center justify-between border-border border-b bg-surface-raised px-8">
          <div className="flex max-w-xl flex-1 items-center gap-6">
            <div className="relative flex-1">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-dim"
                size={15}
              />
              <input
                className="h-9 w-full rounded-lg border border-border bg-surface-sunken pr-4 pl-10 text-[13px] text-ink transition-colors placeholder:text-ink-dim focus:border-accent focus:outline-none"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  currentView === "triage"
                    ? "Search inbox..."
                    : "Search projects..."
                }
                type="text"
                value={searchQuery}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-surface-sunken hover:text-ink"
              type="button"
            >
              <Bell size={18} strokeWidth={1.5} />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent" />
            </button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-3">
              <img
                alt="Profile"
                className="h-8 w-8 rounded-full bg-surface-sunken"
                src="https://api.dicebear.com/7.x/notionists/svg?seed=chi"
              />
              <div className="hidden lg:block">
                <p className="font-semibold text-[13px] text-ink leading-tight">
                  Chi Ejimofor
                </p>
                <p className="text-[10px] text-ink-dim">Desert Services</p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="flex flex-1 overflow-hidden">
          {/* ============================================================
              TRIAGE VIEW
          ============================================================ */}
          {currentView === "triage" && (
            <>
              {/* Inbox Panel */}
              <div className="flex w-80 shrink-0 flex-col border-border border-r bg-surface-raised">
                <div className="flex h-12 items-center justify-between border-border border-b px-5">
                  <span className="section-label">Inbox</span>
                  <span className="rounded bg-accent/10 px-2 py-0.5 font-bold font-mono text-[10px] text-accent">
                    {filteredTriage.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTriage.length > 0 ? (
                    filteredTriage.map((item) => (
                      <InboxItem
                        isSelected={selectedTriageItem?.id === item.id}
                        item={item}
                        key={item.id}
                        onSelect={() => handleTriageSelect(item)}
                      />
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken">
                        <CheckCircle className="text-success" size={20} />
                      </div>
                      <p className="font-medium text-[13px] text-ink-muted">
                        All caught up!
                      </p>
                      <p className="mt-1 text-[12px] text-ink-dim">
                        No items in your inbox
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Triage Detail / Match View */}
              <div className="flex flex-1 items-center justify-center overflow-y-auto bg-grid p-8">
                {selectedTriageItem ? (
                  <div className="w-full max-w-xl">
                    {/* Header */}
                    <div className="mb-8 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
                        <Sparkles className="text-white" size={22} />
                      </div>
                      <div>
                        <h2 className="font-bold text-ink text-xl">
                          Smart Match Found
                        </h2>
                        <p className="text-[13px] text-ink-dim">
                          AI detected a matching estimate
                        </p>
                      </div>
                    </div>

                    {/* Match Card */}
                    <div className="industrial-card mb-6 overflow-hidden rounded-xl">
                      {/* Incoming */}
                      <div className="border-border border-b p-6">
                        <div className="mb-3 flex items-center gap-2">
                          <Mail className="text-ink-dim" size={12} />
                          <span className="section-label">Incoming</span>
                        </div>
                        <p className="mb-2 font-semibold text-[15px] text-ink">
                          {selectedTriageItem.title}
                        </p>
                        <p className="text-[13px] text-ink-muted leading-relaxed">
                          {selectedTriageItem.metadata?.body?.substring(0, 150)}
                          ...
                        </p>
                      </div>

                      {/* Match */}
                      <div className="border-l-4 border-l-accent bg-accent/5 p-6">
                        <div className="mb-3 flex items-center gap-2">
                          <Link2 className="text-accent" size={12} />
                          <span className="section-label text-accent">
                            Matched Estimate
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold font-mono text-[15px] text-ink">
                              #EST-2026-088
                            </p>
                            <p className="text-[13px] text-ink-muted">
                              Greenway Billing Hub
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold font-mono text-ink text-xl">
                              $125,000
                            </p>
                            <p className="font-semibold text-[10px] text-accent">
                              98% match
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-ink font-semibold text-[14px] text-white transition-colors hover:bg-ink-muted"
                        onClick={handleLinkToProject}
                        type="button"
                      >
                        Link & Mark Won
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="h-12 rounded-lg border border-border px-6 font-medium text-[14px] text-ink-muted transition-colors hover:bg-surface-sunken"
                        onClick={handleSkip}
                        type="button"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-sunken">
                      <Inbox className="text-ink-dim" size={28} />
                    </div>
                    <p className="font-medium text-[15px] text-ink-muted">
                      Select an item
                    </p>
                    <p className="mt-1 text-[13px] text-ink-dim">
                      Choose an item from your inbox to review
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ============================================================
              PROJECTS VIEW
          ============================================================ */}
          {currentView === "projects" && !activeProject && (
            <ProjectList
              onSelectProject={handleSelectProject}
              projects={filteredProjects}
            />
          )}

          {currentView === "projects" && activeProject && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Project Header */}
              <div className="shrink-0 border-border border-b bg-surface-raised">
                <div className="flex items-start justify-between px-8 py-5">
                  <div className="flex items-start gap-4">
                    <button
                      className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-dim transition-colors hover:bg-surface-sunken hover:text-ink"
                      onClick={handleBackToProjectList}
                      type="button"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div>
                      <div className="mb-1 flex items-center gap-3">
                        <h1 className="font-bold text-ink text-xl">
                          {activeProject.name}
                        </h1>
                        <span className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-ink-dim">
                          #{activeProject.id.toUpperCase()}
                        </span>
                      </div>
                      <p className="flex items-center gap-2 text-[13px] text-ink-dim">
                        <User size={13} />
                        {activeProject.client}
                      </p>
                    </div>
                  </div>
                  <button
                    className="flex h-9 items-center gap-2 rounded-lg bg-ink px-4 font-semibold text-[13px] text-white transition-colors hover:bg-ink-muted"
                    type="button"
                  >
                    <Plus size={14} />
                    Add Action
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-border border-t px-8">
                  {tabs.map((tab) => (
                    <TabButton
                      active={activeTab === tab.id}
                      icon={tab.icon}
                      key={tab.id}
                      label={tab.label}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto bg-grid p-8">
                <div className="max-w-5xl">
                  {activeTab === "overview" && (
                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 space-y-6">
                        {/* Details */}
                        <section className="industrial-card rounded-xl p-6">
                          <h3 className="section-label mb-4">
                            Project Details
                          </h3>
                          <p className="mb-6 text-[14px] text-ink-muted leading-relaxed">
                            {activeProject.description}
                          </p>
                          <div className="flex gap-8 border-border border-t pt-4">
                            <div className="flex items-center gap-3">
                              <Calendar className="text-ink-dim" size={16} />
                              <div>
                                <p className="text-[11px] text-ink-dim uppercase">
                                  Timeline
                                </p>
                                <p className="font-medium font-mono text-[13px] text-ink">
                                  {activeProject.startDate} →{" "}
                                  {activeProject.endDate}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <User className="text-ink-dim" size={16} />
                              <div>
                                <p className="text-[11px] text-ink-dim uppercase">
                                  Client
                                </p>
                                <p className="font-medium text-[13px] text-ink">
                                  {activeProject.client}
                                </p>
                              </div>
                            </div>
                          </div>
                        </section>

                        {/* Estimates */}
                        <section className="industrial-card overflow-hidden rounded-xl">
                          <div className="flex items-center justify-between border-border border-b px-6 py-4">
                            <h3 className="section-label">Estimates & POs</h3>
                            <span className="text-[11px] text-ink-dim">
                              {activeProject.estimates.length} items
                            </span>
                          </div>
                          <div className="divide-y divide-border">
                            {activeProject.estimates.map((est) => (
                              <div
                                className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-surface-sunken"
                                key={est.id}
                              >
                                <div className="flex items-center gap-4">
                                  <div
                                    className={`h-2 w-2 rounded-full ${est.status === "Won" ? "bg-success" : "bg-info"}`}
                                  />
                                  <div>
                                    <p className="font-medium font-mono text-[13px] text-ink">
                                      {est.number}
                                    </p>
                                    <p className="text-[11px] text-ink-dim">
                                      {est.date}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-mono font-semibold text-[14px] text-ink">
                                    {est.amount}
                                  </span>
                                  <span
                                    className={`rounded px-2 py-0.5 font-semibold text-[10px] ${
                                      est.status === "Won"
                                        ? "bg-success/10 text-success"
                                        : "bg-info/10 text-info"
                                    }`}
                                  >
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
                        <section className="rounded-xl bg-ink p-6 text-white">
                          <div className="mb-4 flex items-center justify-between">
                            <span className="text-[10px] text-white/50 uppercase tracking-wide">
                              Status
                            </span>
                            <Activity className="text-success" size={14} />
                          </div>
                          <p className="mb-1 font-bold text-2xl">On Track</p>
                          <p className="mb-4 text-[12px] text-white/50">
                            Progress: {activeProject.progress}%
                          </p>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${activeProject.progress}%` }}
                            />
                          </div>
                        </section>

                        {/* Tasks */}
                        <section className="industrial-card rounded-xl p-6">
                          <h3 className="section-label mb-4">Tasks</h3>
                          <div className="space-y-3">
                            {activeProject.tasks.slice(0, 4).map((task) => (
                              <div
                                className="flex items-center gap-3"
                                key={task.id}
                              >
                                {task.status === "Done" ? (
                                  <Check className="text-success" size={14} />
                                ) : (
                                  <div className="h-3.5 w-3.5 rounded border-2 border-border" />
                                )}
                                <span
                                  className={`flex-1 truncate text-[13px] ${
                                    task.status === "Done"
                                      ? "text-ink-dim line-through"
                                      : "text-ink-muted"
                                  }`}
                                >
                                  {task.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    </div>
                  )}

                  {activeTab === "timeline" && (
                    <div className="industrial-card rounded-xl p-6">
                      <ProjectTimeline
                        emails={MOCK_EMAILS.filter(
                          (e) => e.projectId === activeProject.id
                        )}
                        files={activeProject.files}
                      />
                    </div>
                  )}

                  {activeTab === "docs" && (
                    <div className="grid grid-cols-3 gap-4">
                      {["Permits", "Blueprints", "Contracts"].map((cat) => (
                        <div
                          className="industrial-card group cursor-pointer rounded-xl p-5 transition-colors hover:border-accent"
                          key={cat}
                        >
                          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken group-hover:bg-accent/10">
                            <Files
                              className="text-ink-dim group-hover:text-accent"
                              size={18}
                            />
                          </div>
                          <p className="font-semibold text-[14px] text-ink group-hover:text-accent">
                            {cat}
                          </p>
                          <p className="text-[12px] text-ink-dim">4 files</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === "tasks" && (
                    <div className="industrial-card overflow-hidden rounded-xl">
                      <table className="w-full">
                        <thead>
                          <tr className="border-border border-b bg-surface-sunken">
                            <th className="section-label px-6 py-3 text-left">
                              Status
                            </th>
                            <th className="section-label px-6 py-3 text-left">
                              Task
                            </th>
                            <th className="section-label px-6 py-3 text-left">
                              Due
                            </th>
                            <th className="section-label px-6 py-3 text-left">
                              Assignee
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {activeProject.tasks.map((task) => (
                            <tr
                              className="transition-colors hover:bg-surface-sunken"
                              key={task.id}
                            >
                              <td className="px-6 py-3">
                                <span
                                  className={`rounded px-2 py-0.5 font-semibold text-[11px] ${
                                    task.status === "Done"
                                      ? "bg-success/10 text-success"
                                      : "bg-warning/10 text-warning"
                                  }`}
                                >
                                  {task.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-[13px] text-ink-muted">
                                {task.title}
                              </td>
                              <td className="px-6 py-3 font-mono text-[13px] text-ink-dim">
                                {task.dueDate}
                              </td>
                              <td className="px-6 py-3 text-[13px] text-ink-dim">
                                {task.assignee}
                              </td>
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
          {currentView === "analytics" && (
            <div className="flex flex-1 items-center justify-center bg-grid">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-sunken">
                  <Activity className="text-ink-dim" size={28} />
                </div>
                <p className="font-medium text-[15px] text-ink-muted">
                  Analytics Dashboard
                </p>
                <p className="mt-1 text-[13px] text-ink-dim">Coming soon</p>
              </div>
            </div>
          )}

          {/* ============================================================
              ARCHIVE VIEW
          ============================================================ */}
          {currentView === "archive" && (
            <div className="flex-1 overflow-y-auto bg-grid p-8">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken">
                    <Inbox className="text-ink-dim" size={22} />
                  </div>
                  <div>
                    <h1 className="font-bold text-ink text-xl">Archive</h1>
                    <p className="text-[13px] text-ink-dim">
                      {archivedItems.length} archived items
                    </p>
                  </div>
                </div>

                {archivedItems.length > 0 ? (
                  <div className="industrial-card divide-y divide-border overflow-hidden rounded-xl">
                    {archivedItems.map((item) => (
                      <div
                        className="flex items-center justify-between p-5 transition-colors hover:bg-surface-sunken"
                        key={item.id}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-ink-dim">
                            <Mail size={14} />
                          </div>
                          <div>
                            <p className="font-medium text-[14px] text-ink">
                              {item.title}
                            </p>
                            <p className="text-[12px] text-ink-dim">
                              {item.subtitle}
                            </p>
                          </div>
                        </div>
                        <button
                          className="font-medium text-[12px] text-accent hover:underline"
                          onClick={() => {
                            // Restore to inbox
                            setTriageItems((prev) => [...prev, item]);
                            setArchivedItems((prev) =>
                              prev.filter((i) => i.id !== item.id)
                            );
                          }}
                          type="button"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="industrial-card rounded-xl p-12 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken">
                      <CheckCircle className="text-ink-dim" size={20} />
                    </div>
                    <p className="font-medium text-[14px] text-ink-muted">
                      Archive is empty
                    </p>
                    <p className="mt-1 text-[13px] text-ink-dim">
                      Skipped items will appear here
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WORKFLOWS PANEL - Show on triage and projects views */}
          {(currentView === "triage" || currentView === "projects") && (
            <div className="flex w-64 shrink-0 flex-col border-border border-l bg-surface-raised">
              <div className="flex h-12 items-center justify-between border-border border-b px-5">
                <span className="section-label">Workflows</span>
                <Sparkles className="text-accent" size={14} />
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-4">
                <div className="space-y-2">
                  <WorkflowButton
                    icon={Wind}
                    label="Dust Permit"
                    sublabel="Auto-generate permit"
                  />
                  <WorkflowButton
                    icon={FileBadge}
                    label="Draft Contract"
                    sublabel="Create from template"
                  />
                  <WorkflowButton
                    icon={Send}
                    label="Billing Check"
                    sublabel="Reconcile invoices"
                  />
                </div>

                {activeProject && (
                  <div>
                    <p className="section-label mb-3">Activity</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                        <div>
                          <p className="text-[12px] text-ink-muted">
                            New PO Linked
                          </p>
                          <p className="font-mono text-[10px] text-ink-dim">
                            2h ago
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border" />
                        <div>
                          <p className="text-[12px] text-ink-muted">
                            Billing reconciled
                          </p>
                          <p className="font-mono text-[10px] text-ink-dim">
                            6h ago
                          </p>
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
