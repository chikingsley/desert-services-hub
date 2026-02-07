import { AlertTriangle, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PIPELINE_STAGES,
  type PipelineContract,
  type PipelineStage,
  STAGE_CONFIG,
} from "@/apps/web/frontend/components/contracts/types";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

type SortKey =
  | "receivedDesc"
  | "receivedAsc"
  | "estimateDesc"
  | "contractorAsc";

interface ContractsTableProps {
  contracts: PipelineContract[];
  onSelect: (contract: PipelineContract) => void;
  selectedId?: string | null;
}

function StageBadge({ stage }: { stage: PipelineStage }) {
  const config = STAGE_CONFIG[stage];
  return (
    <Badge
      className={`${config.bgColor} ${config.color} ${config.borderColor} font-medium`}
      variant="outline"
    >
      {config.shortLabel}
    </Badge>
  );
}

function FlagSummary({ contract }: { contract: PipelineContract }) {
  const errors = contract.flags.filter((flag) => flag.severity === "error");
  const warnings = contract.flags.filter((flag) => flag.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return <span className="text-muted-foreground/60 text-xs">Clear</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {errors.length > 0 && (
        <Badge
          className="gap-1 border-destructive/20 bg-destructive/10 text-destructive"
          variant="outline"
        >
          <AlertTriangle className="h-3 w-3" />
          {errors.length}
        </Badge>
      )}
      {warnings.length > 0 && (
        <Badge
          className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-600"
          variant="outline"
        >
          <AlertTriangle className="h-3 w-3" />
          {warnings.length}
        </Badge>
      )}
    </div>
  );
}

export function ContractsTable({
  contracts,
  onSelect,
  selectedId,
}: ContractsTableProps) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | PipelineStage>("all");
  const [sortKey, setSortKey] = useState<SortKey>("receivedDesc");

  const filteredContracts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = contracts.filter((contract) => {
      const matchesStage =
        stageFilter === "all" || contract.stage === stageFilter;

      if (!normalizedQuery) {
        return matchesStage;
      }

      const haystack = [contract.subject, contract.contractor, contract.id]
        .join(" ")
        .toLowerCase();

      return matchesStage && haystack.includes(normalizedQuery);
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "receivedAsc":
          return (
            new Date(a.receivedDate).getTime() -
            new Date(b.receivedDate).getTime()
          );
        case "estimateDesc":
          return (b.estimateTotal ?? 0) - (a.estimateTotal ?? 0);
        case "contractorAsc":
          return a.contractor.localeCompare(b.contractor);
        default:
          return (
            new Date(b.receivedDate).getTime() -
            new Date(a.receivedDate).getTime()
          );
      }
    });

    return sorted;
  }, [contracts, query, sortKey, stageFilter]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-border/50 border-b bg-muted/20 p-4">
        <div className="min-w-[220px] flex-1">
          <Input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contracts, contractors, or IDs"
            value={query}
          />
        </div>

        <Select
          onValueChange={(value) =>
            setStageFilter(value as "all" | PipelineStage)
          }
          value={stageFilter}
        >
          <SelectTrigger className="min-w-[150px]" size="sm">
            <SelectValue placeholder="Filter stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {PIPELINE_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {STAGE_CONFIG[stage].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => setSortKey(value as SortKey)}
          value={sortKey}
        >
          <SelectTrigger className="min-w-[150px]" size="sm">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="receivedDesc">Newest received</SelectItem>
            <SelectItem value="receivedAsc">Oldest received</SelectItem>
            <SelectItem value="estimateDesc">Highest estimate</SelectItem>
            <SelectItem value="contractorAsc">Contractor A-Z</SelectItem>
          </SelectContent>
        </Select>

        <div className="text-muted-foreground text-sm">
          Showing {filteredContracts.length} of {contracts.length}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="min-w-[220px] font-display font-medium text-foreground">
              Contract
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Contractor
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Stage
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Received
            </TableHead>
            <TableHead className="text-right font-display font-medium text-foreground">
              Estimate
            </TableHead>
            <TableHead className="text-right font-display font-medium text-foreground">
              Contract
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Flags
            </TableHead>
            <TableHead className="text-right font-display font-medium text-foreground">
              Attachments
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredContracts.length === 0 ? (
            <TableRow>
              <TableCell
                className="py-10 text-center text-muted-foreground"
                colSpan={8}
              >
                No contracts match your filters.
              </TableCell>
            </TableRow>
          ) : (
            filteredContracts.map((contract, index) => (
              <TableRow
                className="cursor-pointer transition-colors hover:bg-primary/5"
                data-state={selectedId === contract.id ? "selected" : undefined}
                key={contract.id}
                onClick={() => onSelect(contract)}
                style={{ animationDelay: `${index * 25}ms` }}
              >
                <TableCell className="font-medium text-foreground">
                  <div className="flex flex-col">
                    <span>{contract.subject}</span>
                    <span className="text-muted-foreground text-xs">
                      {contract.id}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {contract.contractor}
                </TableCell>
                <TableCell>
                  <StageBadge stage={contract.stage} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(contract.receivedDate)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {contract.estimateTotal
                    ? formatCurrency(contract.estimateTotal)
                    : "-"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {contract.contractTotal
                    ? formatCurrency(contract.contractTotal)
                    : "-"}
                </TableCell>
                <TableCell>
                  <FlagSummary contract={contract} />
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                    <Paperclip className="h-3.5 w-3.5" />
                    {contract.attachmentCount}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
