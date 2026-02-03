import { ProjectsTable } from "./components/projects/projects-table";
import "./index.css";

export function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="font-bold text-2xl">Project Tracking</h1>
          <p className="text-muted-foreground text-sm">
            Track contracts, permits, and requirements for active projects
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <ProjectsTable />
      </main>
    </div>
  );
}

export default App;
