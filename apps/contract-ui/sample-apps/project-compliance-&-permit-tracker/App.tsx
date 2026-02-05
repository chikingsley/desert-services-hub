import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrainIcon, SearchIcon } from "./components/Icons";
import { TaskChip } from "./components/TaskChip";
import { TaskControlMenu } from "./components/TaskControlMenu";
import { chatWithAgent } from "./geminiService";
import { INITIAL_PROJECTS } from "./mockData";
import type { ChatMessage, ComplianceTask, Project } from "./types";

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTaskMenu, setActiveTaskMenu] = useState<{
    projectId: string;
    taskId: string;
  } | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "agent",
      text: 'Hello! I am your Compliance Agent. I am connected to your project database. You can tell me things like "I just marked the contract redlines as done for Skyline Heights" or "The NOI came in for Riverfront."',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [userInput, setUserInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () =>
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const filteredProjects = useMemo(() => {
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.client.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

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
      prev.map((p) => {
        if (p.id !== projectId) {
          return p;
        }
        return {
          ...p,
          tasks: p.tasks.filter((t) => t.id !== taskId),
        };
      })
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
          tasks: p.tasks.map((t) => {
            if (t.id !== taskId) {
              return t;
            }
            return {
              ...t,
              checkpoints: t.checkpoints.map((cp) =>
                cp.id === checkpointId
                  ? { ...cp, isCompleted: !cp.isCompleted }
                  : cp
              ),
            };
          }),
        };
      })
    );
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) {
      return;
    }

    const userMsg: ChatMessage = {
      role: "user",
      text: userInput,
      timestamp: new Date().toLocaleTimeString(),
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setUserInput("");
    setIsAnalyzing(true);

    try {
      const historyForAI = chatHistory.map((m) => ({
        role: m.role === "agent" ? "model" : "user",
        parts: [{ text: m.text }],
      }));
      historyForAI.push({ role: "user", parts: [{ text: userInput }] });

      const response = await chatWithAgent(projects, historyForAI);

      // Handle Tool Calls
      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          if (fc.name === "updateProjectTask") {
            const { projectId, taskName, checkpointLabel, isCompleted } =
              fc.args as any;

            setProjects((currentProjects) =>
              currentProjects.map((p) => {
                if (p.id !== projectId && p.name !== projectId) {
                  return p;
                }
                return {
                  ...p,
                  tasks: p.tasks.map((t) => {
                    if (t.name.toLowerCase() !== taskName.toLowerCase()) {
                      return t;
                    }
                    if (checkpointLabel) {
                      return {
                        ...t,
                        checkpoints: t.checkpoints.map((cp) =>
                          cp.label
                            .toLowerCase()
                            .includes(checkpointLabel.toLowerCase())
                            ? { ...cp, isCompleted: isCompleted ?? true }
                            : cp
                        ),
                      };
                    }
                    return t;
                  }),
                };
              })
            );

            setChatHistory((prev) => [
              ...prev,
              {
                role: "agent",
                text: `Understood. I've updated the ${taskName} for ${projectId}.`,
                timestamp: new Date().toLocaleTimeString(),
              },
            ]);
          }
        }
      } else {
        setChatHistory((prev) => [
          ...prev,
          {
            role: "agent",
            text: response.text || "I processed that request.",
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch (_err) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Error connecting to service.",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addTask = (projectId: string) => {
    const taskId = Math.random().toString(36).substr(2, 9);
    const newTask: ComplianceTask = {
      id: taskId,
      name: "New Requirement",
      type: TaskType.BINARY,
      status: false,
      isRequired: true,
      lastUpdated: new Date().toISOString(),
      category: "Document",
      checkpoints: [],
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p
      )
    );
    // Immediately open configuration for the new task
    setActiveTaskMenu({ projectId, taskId });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      {!isSidebarOpen && (
        <button
          className="fixed right-6 bottom-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-transform hover:scale-110"
          onClick={() => setIsSidebarOpen(true)}
        >
          <BrainIcon className="h-6 w-6" />
        </button>
      )}

      <div className={"flex flex-1 flex-col transition-all duration-300"}>
        <header className="flex items-center justify-between border-slate-200 border-b bg-white px-8 py-5 shadow-sm">
          <div>
            <h1 className="font-bold text-slate-900 text-xl tracking-tight">
              Compliance Workspace
            </h1>
            <p className="font-black text-[10px] text-slate-400 uppercase tracking-widest">
              Construction Project Controls
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                className="w-64 rounded-full border border-slate-200 bg-slate-50 py-2 pr-4 pl-10 text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500"
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search projects..."
                type="text"
                value={searchTerm}
              />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {filteredProjects.map((project) => (
              <div
                className="flex flex-col items-start gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md md:flex-row"
                key={project.id}
              >
                <div className="w-full flex-shrink-0 md:w-60">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-black text-[10px] text-slate-500">
                      {project.id}
                    </span>
                    <span className="font-bold text-[10px] text-indigo-600 uppercase tracking-widest">
                      {project.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 leading-snug">
                    {project.name}
                  </h3>
                  <p className="text-slate-500 text-sm">{project.client}</p>
                </div>

                <div className="relative flex flex-1 flex-wrap gap-2 pt-1">
                  {project.tasks.map((task) => (
                    <div className="relative" key={task.id}>
                      <TaskChip
                        onClick={() =>
                          setActiveTaskMenu(
                            activeTaskMenu?.taskId === task.id
                              ? null
                              : { projectId: project.id, taskId: task.id }
                          )
                        }
                        task={task}
                      />
                      {activeTaskMenu?.taskId === task.id && (
                        <TaskControlMenu
                          onClose={() => setActiveTaskMenu(null)}
                          onDeleteTask={() =>
                            handleDeleteTask(project.id, task.id)
                          }
                          onToggleCheckpoint={(cpId) =>
                            handleToggleCheckpoint(project.id, task.id, cpId)
                          }
                          onUpdateStatus={(s) =>
                            handleUpdateTask(project.id, task.id, s)
                          }
                          onUpdateTaskSchema={(upd) =>
                            handleUpdateTaskSchema(project.id, task.id, upd)
                          }
                          task={task}
                        />
                      )}
                    </div>
                  ))}
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-200 border-dashed bg-slate-50/50 text-slate-400 transition-all hover:border-indigo-400 hover:text-indigo-500"
                    onClick={() => addTask(project.id)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {isSidebarOpen && (
        <div className="slide-in-from-right relative z-50 flex w-[420px] animate-in flex-col border-slate-200 border-l bg-white shadow-2xl duration-300">
          <div className="flex items-center justify-between bg-indigo-600 p-6 text-white">
            <div className="flex items-center gap-3">
              <BrainIcon className="h-6 w-6" />
              <div>
                <h2 className="font-bold">Compliance Agent</h2>
                <p className="font-bold text-[10px] text-indigo-200 uppercase tracking-widest">
                  Connected to State
                </p>
              </div>
            </div>
            <button
              className="flex items-center gap-1 font-bold text-white/60 text-xs uppercase tracking-widest hover:text-white"
              onClick={() => setIsSidebarOpen(false)}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M6 18L18 6M6 6l12 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
              Hide
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {chatHistory.map((msg, i) => (
              <div
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                key={i}
              >
                <div
                  className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-none bg-indigo-600 text-white shadow-indigo-100 shadow-lg" : "rounded-tl-none border border-slate-100 bg-slate-50 text-slate-700"}`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isAnalyzing && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-none bg-slate-50 p-4">
                  <div className="flex gap-1">
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0.2s]" />
                  </div>
                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">
                    Processing...
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            className="border-slate-100 border-t bg-white p-6"
            onSubmit={handleSendMessage}
          >
            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-12 pl-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Message agent..."
                type="text"
                value={userInput}
              />
              <button
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700"
                type="submit"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M5 12h14M12 5l7 7-7 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
