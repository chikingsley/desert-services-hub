import Fuse from "fuse.js";
import { RefreshCw, Search, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PermitsDataTable } from "./components/permits-table/data-table";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import type { Permit } from "./lib/types";
import "./index.css";

// API helper to fetch permits
async function fetchPermits(): Promise<Permit[]> {
  try {
    const response = await fetch("/api/permits");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch permits:", error);
    return [];
  }
}

// Status filter options
type StatusFilter =
  | "all"
  | "running"
  | "needs_attention"
  | "pending"
  | "active"
  | "failed"
  | "closed";

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "running", label: "Running" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "failed", label: "Failed" },
  { value: "closed", label: "Closed" },
];

// Fuse.js configuration for fuzzy search
const fuseOptions = {
  keys: [
    { name: "current.applicationNumber", weight: 2 },
    { name: "projectName", weight: 1.5 },
    { name: "company", weight: 1.5 },
    { name: "address", weight: 1 },
  ],
  threshold: 0.4, // 0 = exact match, 1 = match anything
  ignoreLocation: true, // Search anywhere in the string
  findAllMatches: true,
};

// Status filter helper
function matchesStatusFilter(permit: Permit, filter: StatusFilter): boolean {
  if (filter === "all") {
    return true;
  }
  const { requestStatus, permitStatus } = permit.current;
  const statusMap: Record<StatusFilter, boolean> = {
    all: true,
    running: requestStatus === "running",
    needs_attention:
      requestStatus === "needs_map" || requestStatus === "failed",
    pending: requestStatus === "pending",
    active: permitStatus === "Active",
    failed: requestStatus === "failed",
    closed: permitStatus === "Closed" || permitStatus === "Superseded",
  };
  return statusMap[filter];
}

export function App() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Create Fuse instance for fuzzy search
  const fuse = useMemo(() => new Fuse(permits, fuseOptions), [permits]);

  // Filter permits based on search and status
  const filteredPermits = useMemo(() => {
    const query = searchQuery.trim();

    // Start with all permits or fuzzy search results
    let results: Permit[];
    if (query) {
      results = fuse.search(query).map((result) => result.item);
    } else {
      results = permits;
    }

    // Then apply status filter
    return results.filter((permit) =>
      matchesStatusFilter(permit, statusFilter)
    );
  }, [permits, searchQuery, statusFilter, fuse]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchPermits();
    setPermits(data);
    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  // Fetch on mount
  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(handleRefresh, 30_000);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  return (
    <div className="flex min-h-screen flex-col bg-[--color-bg-primary] bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-40 border-[--color-border] border-b bg-[--color-bg-primary]/95 backdrop-blur supports-backdrop-filter:bg-[--color-bg-primary]/80">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Title */}
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-orange-600 shadow-amber-900/30 shadow-lg">
                <Zap className="h-5 w-5 text-black" />
              </div>
              <div>
                <h1 className="font-semibold text-lg tracking-tight">
                  Permit Automation
                </h1>
                <p className="font-mono text-[--color-text-muted] text-xs">
                  Control Dashboard
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <span className="hidden font-mono text-[--color-text-muted] text-xs sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
              <Button
                className="gap-2"
                disabled={isLoading}
                onClick={handleRefresh}
                size="sm"
                variant="outline"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto flex-1 px-6 py-8">
        <PermitsDataTable
          data={filteredPermits}
          onRefresh={handleRefresh}
          toolbar={
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search Input */}
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[--color-text-muted]" />
                <Input
                  className="bg-[--color-bg-secondary] pl-9"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search applications, projects, companies..."
                  value={searchQuery}
                />
              </div>

              {/* Status Filter */}
              <Select
                onValueChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
                value={statusFilter}
              >
                <SelectTrigger className="w-full bg-[--color-bg-secondary] sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Reset Filters */}
              {(searchQuery || statusFilter !== "all") && (
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Reset
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          }
        />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-[--color-border] border-t py-4">
        <div className="container mx-auto px-6">
          <p className="text-center font-mono text-[--color-text-muted] text-xs">
            Dust Permit Automation System • VNC: localhost:47821
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
