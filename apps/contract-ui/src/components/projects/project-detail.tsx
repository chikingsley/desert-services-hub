import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Project } from "./columns";

type ProjectTracking = {
  id: number;
  estimate_id: number;
  has_contract: number;
  contract_signed: number;
  contract_file_path: string | null;
  needs_dust_permit: number;
  dust_permit_filed: number;
  dust_permit_number: string | null;
  dust_permit_expiry: string | null;
  needs_noi: number;
  noi_filed: number;
  noi_file_path: string | null;
  needs_swppp: number;
  swppp_plan_received: number;
  swppp_file_path: string | null;
  needs_grading_drainage: number;
  grading_drainage_received: number;
  certified_payroll_required: number;
  insurance_verified: number;
  insurance_exception: string | null;
  swppp_sign_ordered: number;
  dust_sign_ordered: number;
  status: string;
  notes: string | null;
};

type ProjectTask = {
  id: number;
  tracking_id: number;
  description: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

type ProjectDetails = {
  project: Project;
  tracking: ProjectTracking | null;
  tasks: ProjectTask[];
};

type TriState = "na" | "todo" | "done";

type ChecklistItem = {
  id: string;
  label: string;
  state: TriState;
  onNext: () => Promise<void>;
  labelOverride?: string;
};

const TRI_LABELS: Record<TriState, string> = {
  na: "Not Needed",
  todo: "Needed",
  done: "Done",
};

const TRI_CLASSES: Record<TriState, string> = {
  na: "border-muted bg-muted text-muted-foreground",
  todo: "border-amber-200 bg-amber-100 text-amber-900",
  done: "border-emerald-200 bg-emerald-100 text-emerald-900",
};

const TASK_STATUSES = ["todo", "doing", "blocked", "done"];

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function nextTriState(state: TriState): TriState {
  if (state === "na") {
    return "todo";
  }
  if (state === "todo") {
    return "done";
  }
  return "na";
}

function contractState(tracking: ProjectTracking): TriState {
  if (tracking.contract_signed) {
    return "done";
  }
  if (tracking.has_contract) {
    return "todo";
  }
  return "na";
}

function contractLabel(state: TriState): string {
  if (state === "done") {
    return "Signed";
  }
  if (state === "todo") {
    return "Received";
  }
  return "Not Received";
}

function contractUpdates(state: TriState) {
  if (state === "done") {
    return { has_contract: 1, contract_signed: 1 };
  }
  if (state === "todo") {
    return { has_contract: 1, contract_signed: 0 };
  }
  return { has_contract: 0, contract_signed: 0 };
}

export function ProjectDetail({ projectId }: { projectId: number | null }) {
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");

  const loadDetails = useCallback(async () => {
    if (!projectId) {
      setDetails(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error("Failed to load project");
      }
      const data = (await response.json()) as ProjectDetails;
      setDetails(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const tracking = details?.tracking;

  const updateTracking = useCallback(
    async (id: number | null, updates: Record<string, unknown>) => {
      if (!id) {
        return;
      }
      await fetch(`/api/projects/${id}/tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      await loadDetails();
    },
    [loadDetails]
  );

  const checklist = useMemo<ChecklistItem[]>(() => {
    if (!(tracking && projectId)) {
      return [];
    }

    const items: ChecklistItem[] = [];
    const contractCurrent = contractState(tracking);

    items.push({
      id: "contract",
      label: "Contract",
      state: contractCurrent,
      labelOverride: contractLabel(contractCurrent),
      onNext: async () => {
        const next = nextTriState(contractCurrent);
        await updateTracking(projectId, contractUpdates(next));
      },
    });

    const makeNeedsItem = (
      id: string,
      label: string,
      needs: number,
      done: number,
      needsField: keyof ProjectTracking,
      doneField: keyof ProjectTracking
    ): ChecklistItem => {
      let state: TriState = "na";
      if (needs === 1) {
        state = done === 1 ? "done" : "todo";
      }
      return {
        id,
        label,
        state,
        onNext: async () => {
          const next = nextTriState(state);
          const updates: Record<string, number> = {
            [needsField]: next === "na" ? 0 : 1,
            [doneField]: next === "done" ? 1 : 0,
          };
          await updateTracking(projectId, updates);
        },
      };
    };

    items.push(
      makeNeedsItem(
        "dust_permit",
        "Dust Permit",
        tracking.needs_dust_permit,
        tracking.dust_permit_filed,
        "needs_dust_permit",
        "dust_permit_filed"
      )
    );

    items.push(
      makeNeedsItem(
        "noi",
        "NOI/NDC",
        tracking.needs_noi,
        tracking.noi_filed,
        "needs_noi",
        "noi_filed"
      )
    );

    items.push(
      makeNeedsItem(
        "swppp_plan",
        "SWPPP Plan",
        tracking.needs_swppp,
        tracking.swppp_plan_received,
        "needs_swppp",
        "swppp_plan_received"
      )
    );

    items.push(
      makeNeedsItem(
        "grading",
        "Grading & Drainage",
        tracking.needs_grading_drainage,
        tracking.grading_drainage_received,
        "needs_grading_drainage",
        "grading_drainage_received"
      )
    );

    return items;
  }, [projectId, tracking, updateTracking]);

  async function toggleField(field: keyof ProjectTracking) {
    if (!(projectId && tracking)) {
      return;
    }
    const current = tracking[field] as number;
    const next = current ? 0 : 1;
    await updateTracking(projectId, { [field]: next });
  }

  async function addTask() {
    if (!projectId) {
      return;
    }
    const trimmed = newTask.trim();
    if (!trimmed) {
      return;
    }
    await fetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: trimmed }),
    });
    setNewTask("");
    await loadDetails();
  }

  async function updateTaskStatus(taskId: number, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadDetails();
  }

  if (!projectId) {
    return (
      <Card>
        <CardContent>
          <div className="text-muted-foreground text-sm">
            Select a project to view details.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="text-muted-foreground text-sm">
            Loading project details...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <div className="text-destructive text-sm">Error: {error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!details) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{details.project.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs uppercase">
              Contractor
            </div>
            <div className="text-sm">{details.project.contractor ?? "-"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">Value</div>
            <div className="text-sm tabular-nums">
              {formatCurrency(details.project.awarded_value)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs uppercase">
              Status
            </div>
            <div className="text-sm capitalize">{details.project.status}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tracking ? (
              checklist.map((item) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={item.id}
                >
                  <div className="text-sm">{item.label}</div>
                  <Button
                    className={cn(
                      "border px-3 py-1 font-medium text-xs",
                      TRI_CLASSES[item.state]
                    )}
                    onClick={item.onNext}
                    size="sm"
                    variant="outline"
                  >
                    {item.labelOverride ?? TRI_LABELS[item.state]}
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-sm">
                No tracking record found.
              </div>
            )}

            {tracking && (
              <div className="space-y-2 pt-2">
                <div className="text-muted-foreground text-xs uppercase">
                  Flags
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className={cn(
                      tracking.certified_payroll_required
                        ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                        : "border-muted"
                    )}
                    onClick={() => toggleField("certified_payroll_required")}
                    size="sm"
                    variant="outline"
                  >
                    Certified Payroll
                  </Button>
                  <Button
                    className={cn(
                      tracking.insurance_verified
                        ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                        : "border-muted"
                    )}
                    onClick={() => toggleField("insurance_verified")}
                    size="sm"
                    variant="outline"
                  >
                    Insurance Verified
                  </Button>
                  <Button
                    className={cn(
                      tracking.swppp_sign_ordered
                        ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                        : "border-muted"
                    )}
                    onClick={() => toggleField("swppp_sign_ordered")}
                    size="sm"
                    variant="outline"
                  >
                    SWPPP Sign Ordered
                  </Button>
                  <Button
                    className={cn(
                      tracking.dust_sign_ordered
                        ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                        : "border-muted"
                    )}
                    onClick={() => toggleField("dust_sign_ordered")}
                    size="sm"
                    variant="outline"
                  >
                    Dust Sign Ordered
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                onChange={(event) => setNewTask(event.target.value)}
                placeholder="Add a task..."
                value={newTask}
              />
              <Button onClick={addTask}>Add</Button>
            </div>

            {details.tasks.length === 0 ? (
              <div className="text-muted-foreground text-sm">No tasks yet.</div>
            ) : (
              <div className="space-y-2">
                {details.tasks.map((task) => {
                  const statusValue = TASK_STATUSES.includes(task.status)
                    ? task.status
                    : "todo";
                  return (
                    <div
                      className="flex items-center justify-between gap-3"
                      key={task.id}
                    >
                      <div className="text-sm">{task.description}</div>
                      <Select
                        onValueChange={(value) =>
                          updateTaskStatus(task.id, value)
                        }
                        value={statusValue}
                      >
                        <SelectTrigger className="min-w-[120px]" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
