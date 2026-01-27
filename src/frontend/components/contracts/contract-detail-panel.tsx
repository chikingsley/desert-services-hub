/**
 * Contract detail panel - slides in from the right.
 * Shows extraction data, reconciliation math, validation issues, and actions.
 */
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  Minus,
  Paperclip,
  Plus,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  type PipelineContract,
  type PipelineStage,
  STAGE_CONFIG,
} from "./types";

interface ContractDetailPanelProps {
  contract: PipelineContract | null;
  open: boolean;
  onClose: () => void;
  onAdvance: (contract: PipelineContract) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function StageBadge({ stage }: { stage: PipelineStage }) {
  const config = STAGE_CONFIG[stage];
  return (
    <Badge
      className={cn("gap-1", config.bgColor, config.color, config.borderColor)}
      variant="outline"
    >
      <div className={cn("h-1.5 w-1.5 rounded-full bg-current")} />
      {config.label}
    </Badge>
  );
}

function MathBreakdown({ contract }: { contract: PipelineContract }) {
  const { mathCheck, estimateTotal, contractTotal } = contract;
  if (!mathCheck || estimateTotal === null || contractTotal === null) {
    return (
      <div className="rounded-lg border border-border/50 border-dashed p-4 text-center">
        <Calculator className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
        <p className="text-muted-foreground/60 text-xs">
          Math check available after reconciliation
        </p>
      </div>
    );
  }

  const { matches, variance, removedTotal, addedTotal } = mathCheck;

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        matches
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-destructive/20 bg-destructive/5"
      )}
    >
      {/* The equation */}
      <div className="mb-3 flex items-center justify-center gap-1 font-mono text-xs">
        <span className="text-muted-foreground">Estimate</span>
        <Minus className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Removed</span>
        <Plus className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground">Added</span>
        <span className="text-muted-foreground">=</span>
        <span className="text-muted-foreground">Contract</span>
      </div>

      {/* The numbers */}
      <div className="mb-3 flex items-center justify-center gap-1 font-mono text-sm">
        <span className="font-medium">{formatCurrency(estimateTotal)}</span>
        <Minus className="h-3 w-3 text-destructive" />
        <span className="text-destructive">{formatCurrency(removedTotal)}</span>
        <Plus className="h-3 w-3 text-emerald-600" />
        <span className="text-emerald-600">{formatCurrency(addedTotal)}</span>
        <span className="text-muted-foreground">=</span>
        <span className="font-semibold">
          {formatCurrency(mathCheck.calculated)}
        </span>
      </div>

      {/* Result */}
      <div className="flex items-center justify-center gap-2">
        {matches ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-display font-medium text-emerald-600 text-sm">
              Math balances
            </span>
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="font-display font-medium text-destructive text-sm">
              Variance: {formatCurrency(Math.abs(variance))}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function FlagsList({ contract }: { contract: PipelineContract }) {
  if (contract.flags.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/5 p-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span className="text-emerald-700 text-sm">No issues found</span>
      </div>
    );
  }

  const severityIcon = {
    error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
    info: <Info className="h-3.5 w-3.5 text-sky-600" />,
  };

  const severityColor = {
    error: "border-destructive/15 bg-destructive/5",
    warning: "border-amber-500/15 bg-amber-500/5",
    info: "border-sky-500/15 bg-sky-500/5",
  };

  return (
    <div className="space-y-2">
      {contract.flags.map((flag, i) => (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border p-3",
            severityColor[flag.severity]
          )}
          key={`${flag.type}-${i}`}
        >
          <div className="mt-0.5 shrink-0">{severityIcon[flag.severity]}</div>
          <div className="min-w-0">
            <div className="font-medium text-foreground text-xs">
              {flag.type}
            </div>
            <div className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
              {flag.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContractDetailPanel({
  contract,
  open,
  onClose,
  onAdvance,
}: ContractDetailPanelProps) {
  if (!contract) {
    return null;
  }

  const stageConfig = STAGE_CONFIG[contract.stage];
  const isDone = contract.stage === "done";

  return (
    <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader className="border-border/50 border-b pb-4">
          <div className="flex items-center gap-2">
            <StageBadge stage={contract.stage} />
          </div>
          <SheetTitle className="font-display text-lg leading-tight">
            {contract.subject}
          </SheetTitle>
          <SheetDescription>{contract.contractor}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 p-4">
          {/* Quick info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Received
              </div>
              <div className="mt-1 font-medium text-sm">
                {new Date(contract.receivedDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Attachments
              </div>
              <div className="mt-1 flex items-center gap-1.5 font-medium text-sm">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                {contract.attachmentCount} files
              </div>
            </div>
            {contract.estimateTotal !== null && (
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Estimate
                </div>
                <div className="mt-1 font-medium font-mono text-sm">
                  {formatCurrency(contract.estimateTotal)}
                </div>
              </div>
            )}
            {contract.contractTotal !== null && (
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Contract
                </div>
                <div className="mt-1 font-medium font-mono text-sm">
                  {formatCurrency(contract.contractTotal)}
                </div>
              </div>
            )}
          </div>

          {/* Math breakdown */}
          <div>
            <h3 className="mb-3 font-display font-medium text-foreground text-sm">
              Reconciliation Math
            </h3>
            <MathBreakdown contract={contract} />
          </div>

          <Separator className="bg-border/50" />

          {/* Validation flags */}
          <div>
            <h3 className="mb-3 font-display font-medium text-foreground text-sm">
              Validation Issues
            </h3>
            <FlagsList contract={contract} />
          </div>

          <Separator className="bg-border/50" />

          {/* Links */}
          <div className="flex gap-2">
            {contract.notionUrl && (
              <Button
                asChild
                className="flex-1 gap-1.5"
                size="sm"
                variant="outline"
              >
                <a
                  href={contract.notionUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Notion
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {contract.mondayUrl && (
              <Button
                asChild
                className="flex-1 gap-1.5"
                size="sm"
                variant="outline"
              >
                <a
                  href={contract.mondayUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Monday
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Footer action */}
        {!isDone && (
          <SheetFooter className="border-border/50 border-t">
            <Button
              className="w-full gap-2"
              onClick={() => onAdvance(contract)}
              size="lg"
            >
              {stageConfig.verb}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
