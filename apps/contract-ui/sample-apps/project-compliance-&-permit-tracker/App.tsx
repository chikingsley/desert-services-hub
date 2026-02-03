
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Project, PermitStage, TaskType, ComplianceTask, ChatMessage } from './types';
import { INITIAL_PROJECTS } from './mockData';
import { chatWithAgent } from './geminiService';
import { SearchIcon, CheckCircleIcon, AlertCircleIcon, EditIcon, BrainIcon, ClockIcon } from './components/Icons';
import { TaskChip } from './components/TaskChip';
import { TaskControlMenu } from './components/TaskControlMenu';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTaskMenu, setActiveTaskMenu] = useState<{ projectId: string, taskId: string } | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'agent', text: 'Hello! I am your Compliance Agent. I am connected to your project database. You can tell me things like "I just marked the contract redlines as done for Skyline Heights" or "The NOI came in for Riverfront."', timestamp: new Date().toLocaleTimeString() }
  ]);
  const [userInput, setUserInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [chatHistory]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.client.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

  const handleUpdateTask = (projectId: string, taskId: string, newStatus: any) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: p.tasks.map(t => t.id === taskId ? { ...t, status: newStatus, lastUpdated: new Date().toISOString() } : t)
      };
    }));
  };

  const handleUpdateTaskSchema = (projectId: string, taskId: string, updates: Partial<ComplianceTask>) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...updates, lastUpdated: new Date().toISOString() } : t)
      };
    }));
  };

  const handleDeleteTask = (projectId: string, taskId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: p.tasks.filter(t => t.id !== taskId)
      };
    }));
    setActiveTaskMenu(null);
  };

  const handleToggleCheckpoint = (projectId: string, taskId: string, checkpointId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        tasks: p.tasks.map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            checkpoints: t.checkpoints.map(cp => cp.id === checkpointId ? { ...cp, isCompleted: !cp.isCompleted } : cp)
          };
        })
      };
    }));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userMsg: ChatMessage = { role: 'user', text: userInput, timestamp: new Date().toLocaleTimeString() };
    setChatHistory(prev => [...prev, userMsg]);
    setUserInput('');
    setIsAnalyzing(true);

    try {
      const historyForAI = chatHistory.map(m => ({ 
        role: m.role === 'agent' ? 'model' : 'user', 
        parts: [{ text: m.text }] 
      }));
      historyForAI.push({ role: 'user', parts: [{ text: userInput }] });

      const response = await chatWithAgent(projects, historyForAI);
      
      // Handle Tool Calls
      if (response.functionCalls) {
        for (const fc of response.functionCalls) {
          if (fc.name === 'updateProjectTask') {
            const { projectId, taskName, checkpointLabel, isCompleted } = fc.args as any;
            
            setProjects(currentProjects => currentProjects.map(p => {
              if (p.id !== projectId && p.name !== projectId) return p;
              return {
                ...p,
                tasks: p.tasks.map(t => {
                  if (t.name.toLowerCase() !== taskName.toLowerCase()) return t;
                  if (checkpointLabel) {
                    return {
                      ...t,
                      checkpoints: t.checkpoints.map(cp => 
                        cp.label.toLowerCase().includes(checkpointLabel.toLowerCase()) 
                        ? { ...cp, isCompleted: isCompleted ?? true } : cp
                      )
                    };
                  }
                  return t;
                })
              };
            }));
            
            setChatHistory(prev => [...prev, { role: 'agent', text: `Understood. I've updated the ${taskName} for ${projectId}.`, timestamp: new Date().toLocaleTimeString() }]);
          }
        }
      } else {
        setChatHistory(prev => [...prev, { role: 'agent', text: response.text || "I processed that request.", timestamp: new Date().toLocaleTimeString() }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'agent', text: "Error connecting to service.", timestamp: new Date().toLocaleTimeString() }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addTask = (projectId: string) => {
    const taskId = Math.random().toString(36).substr(2, 9);
    const newTask: ComplianceTask = {
      id: taskId,
      name: 'New Requirement',
      type: TaskType.BINARY,
      status: false,
      isRequired: true,
      lastUpdated: new Date().toISOString(),
      category: 'Document',
      checkpoints: []
    };
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: [...p.tasks, newTask] } : p));
    // Immediately open configuration for the new task
    setActiveTaskMenu({ projectId, taskId });
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-[60]"
        >
          <BrainIcon className="w-6 h-6" />
        </button>
      )}

      <div className={`flex-1 flex flex-col transition-all duration-300`}>
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Compliance Workspace</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Construction Project Controls</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-full w-64 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            {filteredProjects.map(project => (
              <div key={project.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6 items-start">
                <div className="w-full md:w-60 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black">{project.id}</span>
                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">{project.status}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 leading-snug">{project.name}</h3>
                  <p className="text-sm text-slate-500">{project.client}</p>
                </div>

                <div className="flex-1 flex flex-wrap gap-2 pt-1 relative">
                  {project.tasks.map(task => (
                    <div key={task.id} className="relative">
                      <TaskChip 
                        task={task} 
                        onClick={() => setActiveTaskMenu(activeTaskMenu?.taskId === task.id ? null : { projectId: project.id, taskId: task.id })} 
                      />
                      {activeTaskMenu?.taskId === task.id && (
                        <TaskControlMenu 
                          task={task}
                          onUpdateStatus={(s) => handleUpdateTask(project.id, task.id, s)}
                          onUpdateTaskSchema={(upd) => handleUpdateTaskSchema(project.id, task.id, upd)}
                          onToggleCheckpoint={(cpId) => handleToggleCheckpoint(project.id, task.id, cpId)}
                          onDeleteTask={() => handleDeleteTask(project.id, task.id)}
                          onClose={() => setActiveTaskMenu(null)}
                        />
                      )}
                    </div>
                  ))}
                  <button 
                    onClick={() => addTask(project.id)}
                    className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all bg-slate-50/50"
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
        <div className="w-[420px] bg-white border-l border-slate-200 flex flex-col shadow-2xl relative z-50 animate-in slide-in-from-right duration-300">
          <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <BrainIcon className="w-6 h-6" />
              <div>
                <h2 className="font-bold">Compliance Agent</h2>
                <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest">Connected to State</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="text-white/60 hover:text-white flex items-center gap-1 font-bold text-xs uppercase tracking-widest">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              Hide
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-100 shadow-lg' : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isAnalyzing && (
              <div className="flex justify-start">
                <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Processing...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-6 border-t border-slate-100 bg-white">
            <div className="relative">
              <input 
                type="text" 
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                placeholder="Message agent..."
                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default App;
