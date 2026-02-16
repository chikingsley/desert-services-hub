import type { EditorEstimate } from "@lib/db/types";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Calendar } from "@/apps/web/frontend/components/ui/calendar";
import { Input } from "@/apps/web/frontend/components/ui/input";
import { Label } from "@/apps/web/frontend/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/apps/web/frontend/components/ui/popover";

interface EstimateHeaderFormProps {
  estimate: EditorEstimate;
  updateEstimate: (updater: (prev: EditorEstimate) => EditorEstimate) => void;
}

export function EstimateHeaderForm({
  estimate,
  updateEstimate,
}: EstimateHeaderFormProps) {
  return (
    <>
      {/* Header Info */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-2">
          <Label
            className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
            htmlFor="estimator"
          >
            Estimator
          </Label>
          <Input
            className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
            id="estimator"
            onChange={(e) =>
              updateEstimate((p) => ({ ...p, estimator: e.target.value }))
            }
            placeholder="Estimator name"
            value={estimate.estimator}
          />
        </div>
        <div className="grid gap-2">
          <Label
            className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
            htmlFor="date"
          >
            Date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                className="h-10 w-full justify-between rounded-lg border-border/50 bg-background font-normal transition-colors hover:border-primary"
                variant="outline"
              >
                <span>
                  {new Date(estimate.date).toLocaleDateString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "numeric",
                  })}
                </span>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                defaultMonth={new Date(estimate.date)}
                mode="single"
                onSelect={(date) => {
                  if (date) {
                    updateEstimate((p) => ({
                      ...p,
                      date: date.toISOString(),
                    }));
                  }
                }}
                selected={new Date(estimate.date)}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-2">
          <Label
            className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
            htmlFor="estimateNumber"
          >
            Estimate #
          </Label>
          <Input
            className="h-10 rounded-lg border-border/50 bg-background font-mono transition-colors focus:border-primary"
            id="estimateNumber"
            onChange={(e) =>
              updateEstimate((p) => ({
                ...p,
                estimateNumber: e.target.value,
              }))
            }
            value={estimate.estimateNumber}
          />
        </div>
      </div>

      {/* Bill To and Job Info */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bill To */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display font-semibold text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs">
              1
            </span>
            Bill To
          </h3>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label
                className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                htmlFor="companyName"
              >
                Company Name
              </Label>
              <Input
                className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                id="companyName"
                onChange={(e) =>
                  updateEstimate((p) => ({
                    ...p,
                    billTo: { ...p.billTo, companyName: e.target.value },
                  }))
                }
                placeholder="Company name"
                value={estimate.billTo.companyName}
              />
            </div>
            <div className="grid gap-2">
              <Label
                className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                htmlFor="companyAddress"
              >
                Company Address
              </Label>
              <Input
                className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                id="companyAddress"
                onChange={(e) =>
                  updateEstimate((p) => ({
                    ...p,
                    billTo: { ...p.billTo, address: e.target.value },
                  }))
                }
                placeholder="Enter company address..."
                value={estimate.billTo.address}
              />
            </div>
          </div>
        </div>

        {/* Job Info */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display font-semibold text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs">
              2
            </span>
            Job Information
          </h3>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label
                className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                htmlFor="jobName"
              >
                Job Name
              </Label>
              <Input
                className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                id="jobName"
                onChange={(e) =>
                  updateEstimate((p) => ({
                    ...p,
                    jobInfo: { ...p.jobInfo, siteName: e.target.value },
                  }))
                }
                placeholder="Job name"
                value={estimate.jobInfo.siteName}
              />
            </div>
            <div className="grid gap-2">
              <Label
                className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
                htmlFor="jobAddress"
              >
                Job Address
              </Label>
              <Input
                className="h-10 rounded-lg border-border/50 bg-background transition-colors focus:border-primary"
                id="jobAddress"
                onChange={(e) =>
                  updateEstimate((p) => ({
                    ...p,
                    jobInfo: { ...p.jobInfo, address: e.target.value },
                  }))
                }
                placeholder="Enter job address..."
                value={estimate.jobInfo.address}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
