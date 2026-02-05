import { Inbox } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { INITIAL_EMAILS, INITIAL_PROJECTS } from "@/mockData";
import {
  type ComplianceTask,
  type Email,
  type EmailTag,
  type Project,
  TaskType,
} from "@/types";
import { Header } from "./components/layout/Header";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectFeed } from "./components/ProjectFeed";

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [emails, setEmails] = useState<Email[]>(INITIAL_EMAILS);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [focusedProjectID, setFocusedProjectID] = useState<string>(
    projects[0].id
  );
  const [focusedTaskID, setFocusedTaskID] = useState<string | null>(null);

  const [activeTaskMenu, setActiveTaskMenu] = useState<{
    projectId: string;
    taskId: string;
  } | null>(null);

  const focusedProject = useMemo(
    () => projects.find((p) => p.id === focusedProjectID) || projects[0],
    [projects, focusedProjectID]
  );

  const sortedProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => {
        // Sort by projects with action-required emails first
        const aHasAction = emails.some(
          (e) => e.isActionRequired && e.tags.some((t) => t.projectId === a.id)
        );
        const bHasAction = emails.some(
          (e) => e.isActionRequired && e.tags.some((t) => t.projectId === b.id)
        );
        if (aHasAction && !bHasAction) {
          return -1;
        }
        if (!aHasAction && bHasAction) {
          return 1;
        }
        return 0;
      })
      .filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.client.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [projects, emails, searchTerm]);

  // Count unread emails per project
  const getProjectEmailCount = (projectId: string) => {
    return emails.filter(
      (e) => !e.isRead && e.tags.some((t) => t.projectId === projectId)
    ).length;
  };

  const handleUpdateTask = (
    projectId: string,
    taskId: string,
    newStatus: any
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) {
          return p;
        }
        return {
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: newStatus,
                  lastUpdated: new Date().toISOString(),
                }
              : t
          ),
        };
      })
    );
  };

  const handleUpdateTaskSchema = (
    projectId: string,
    taskId: string,
    updates: Partial<ComplianceTask>
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) {
          return p;
        }
        return {
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId
              ? { ...t, ...updates, lastUpdated: new Date().toISOString() }
              : t
          ),
        };
      })
    );
  };

  const handleDeleteTask = (projectId: string, taskId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
          : p
      )
    );
    setActiveTaskMenu(null);
  };

  const handleToggleCheckpoint = (
    projectId: string,
    taskId: string,
    checkpointId: string
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) {
          return p;
        }
        return {
          ...p,
          tasks: p.tasks.map((t) =>
            t.id !== taskId
              ? t
              : {
                  ...t,
                  checkpoints: t.checkpoints.map((cp) =>
                    cp.id === checkpointId
                      ? { ...cp, isCompleted: !cp.isCompleted }
                      : cp
                  ),
                }
          ),
        };
      })
    );
  };

  const addTask = (projectId: string) => {
    const taskId = Math.random().toString(36).substring(2, 11);
    const newTask: ComplianceTask = {
      id: taskId,
      name: "New Requirement",
      type: TaskType.BINARY,
      status: false,
      isRequired: true,
      lastUpdated: new Date().toISOString(),
      category: "Document",
      checkpoints: [],
      history: [],
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p
      )
    );
    setActiveTaskMenu({ projectId, taskId });
  };

  // Email handlers
  const handleToggleEmailRead = (emailId: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, isRead: !e.isRead } : e))
    );
  };

  const handleToggleEmailStar = (emailId: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === emailId ? { ...e, isStarred: !e.isStarred } : e
      )
    );
  };

  const handleTagEmail = (emailId: string, tag: EmailTag) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== emailId) {
          return e;
        }
        // Check if tag already exists
        const tagExists = e.tags.some(
          (t) => t.projectId === tag.projectId && t.taskId === tag.taskId
        );
        if (tagExists) {
          return e;
        }
        return { ...e, tags: [...e.tags, tag] };
      })
    );
  };

  const handleRemoveTag = (
    emailId: string,
    projectId: string,
    taskId?: string
  ) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (e.id !== emailId) {
          return e;
        }
        return {
          ...e,
          tags: e.tags.filter(
            (t) => !(t.projectId === projectId && t.taskId === taskId)
          ),
        };
      })
    );
  };

  const unreadEmailCount = emails.filter((e) => !e.isRead).length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      {!isSidebarOpen && (
        <Button
          className="fixed right-6 bottom-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-transform hover:scale-110 hover:bg-indigo-700"
          onClick={() => setIsSidebarOpen(true)}
        >
          <Inbox className="h-6 w-6" />
          {unreadEmailCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 font-bold text-white text-xs">
              {unreadEmailCount}
            </span>
          )}
        </Button>
      )}

      <div className="flex flex-1 flex-col transition-all duration-300">
        <Header searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

        <ScrollArea className="flex-1 bg-[#fdfdfe]">
          <main className="p-8">
            <div className="mx-auto max-w-6xl space-y-6">
              {sortedProjects.map((project) => {
                const projectEmails = emails.filter((e) =>
                  e.tags.some((t) => t.projectId === project.id)
                );
                const hasActionEmail = projectEmails.some(
                  (e) => e.isActionRequired && !e.isRead
                );

                return (
                  <ProjectCard
                    activeTaskMenu={activeTaskMenu}
                    emailCount={getProjectEmailCount(project.id)}
                    focusedProjectID={focusedProjectID}
                    focusedTaskID={focusedTaskID}
                    hasCriticalAction={hasActionEmail}
                    isActive={focusedProjectID === project.id}
                    key={project.id}
                    onAddTask={() => addTask(project.id)}
                    onCloseMenu={() => setActiveTaskMenu(null)}
                    onDeleteTask={(taskId) =>
                      handleDeleteTask(project.id, taskId)
                    }
                    onProjectClick={() => {
                      setFocusedProjectID(project.id);
                      setFocusedTaskID(null);
                    }}
                    onTaskClick={(taskId) => {
                      setFocusedProjectID(project.id);
                      setFocusedTaskID(taskId);
                      setActiveTaskMenu(
                        activeTaskMenu?.taskId === taskId
                          ? null
                          : { projectId: project.id, taskId }
                      );
                    }}
                    onToggleCheckpoint={(taskId, cpId) =>
                      handleToggleCheckpoint(project.id, taskId, cpId)
                    }
                    onUpdateTask={(taskId, s) =>
                      handleUpdateTask(project.id, taskId, s)
                    }
                    onUpdateTaskSchema={(taskId, upd) =>
                      handleUpdateTaskSchema(project.id, taskId, upd)
                    }
                    project={project}
                  />
                );
              })}
            </div>
          </main>
        </ScrollArea>
      </div>

      {isSidebarOpen && (
        <aside className="slide-in-from-right relative z-50 flex w-[480px] animate-in flex-col overflow-hidden border-slate-200 border-l bg-white shadow-2xl duration-300">
          <ProjectFeed
            allProjects={projects}
            emails={emails}
            focusedTaskID={focusedTaskID}
            onClose={() => setIsSidebarOpen(false)}
            onFocusTask={setFocusedTaskID}
            onRemoveTag={handleRemoveTag}
            onTagEmail={handleTagEmail}
            onToggleEmailRead={handleToggleEmailRead}
            onToggleEmailStar={handleToggleEmailStar}
            project={focusedProject}
          />
        </aside>
      )}
    </div>
  );
};

export default App;
