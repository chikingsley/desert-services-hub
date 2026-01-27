/**
 * Contracts Pipeline Page
 *
 * Mission control for contract reconciliation.
 * Contracts flow through: Queue -> Collected -> Extracted -> Validated -> Reconciled -> Done
 *
 * Drag-and-drop powered by @atlaskit/pragmatic-drag-and-drop.
 * The monitor lives here so card/column components stay pure.
 */
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ContractDetailPanel } from "@/components/contracts/contract-detail-panel";
import { PipelineBoard } from "@/components/contracts/pipeline-board";
import { PipelineStats } from "@/components/contracts/pipeline-stats";
import { SAMPLE_CONTRACTS } from "@/components/contracts/sample-data";
import type {
  PipelineContract,
  PipelineStage,
} from "@/components/contracts/types";
import { PIPELINE_STAGES } from "@/components/contracts/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

// TODO: Replace with real API loader when backend endpoint exists
export function contractsLoader(): PipelineContract[] {
  // Future: fetch from /api/contracts/pipeline
  return SAMPLE_CONTRACTS;
}

export function ContractsPage() {
  const [contracts, setContracts] =
    useState<PipelineContract[]>(SAMPLE_CONTRACTS);
  const [selectedContract, setSelectedContract] =
    useState<PipelineContract | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleSelect = useCallback((contract: PipelineContract) => {
    setSelectedContract(contract);
    setPanelOpen(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleAdvance = useCallback((contract: PipelineContract) => {
    const currentIndex = PIPELINE_STAGES.indexOf(contract.stage);
    if (currentIndex >= PIPELINE_STAGES.length - 1) {
      return;
    }

    const nextStage: PipelineStage = PIPELINE_STAGES[currentIndex + 1];

    setContracts((prev) =>
      prev.map((c) => (c.id === contract.id ? { ...c, stage: nextStage } : c))
    );

    setSelectedContract((prev) =>
      prev?.id === contract.id ? { ...prev, stage: nextStage } : prev
    );
  }, []);

  const handleMoveContract = useCallback(
    (contractId: string, toStage: PipelineStage, _toIndex: number) => {
      setContracts((prev) =>
        prev.map((c) => (c.id === contractId ? { ...c, stage: toStage } : c))
      );

      setSelectedContract((prev) =>
        prev?.id === contractId ? { ...prev, stage: toStage } : prev
      );
    },
    []
  );

  // Global drag monitor - handles all drop events
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "contract",
      onDrop: ({ source, location }) => {
        const dropTargets = location.current.dropTargets;
        if (dropTargets.length === 0) {
          return;
        }

        const contractId = source.data.contractId as string;
        const _sourceStage = source.data.stage as PipelineStage;

        // Find the column drop target (always the last/outermost one)
        const columnTarget = dropTargets.find((t) => t.data.type === "column");
        // Find the card drop target (if dropped on a specific card)
        const cardTarget = dropTargets.find((t) => t.data.type === "contract");

        if (!columnTarget) {
          return;
        }

        const destinationStage = columnTarget.data.stage as PipelineStage;

        if (cardTarget) {
          // Dropped on a specific card - use closest edge for positioning
          const targetIndex = cardTarget.data.index as number;
          const edge = extractClosestEdge(cardTarget.data);
          const insertIndex = edge === "bottom" ? targetIndex + 1 : targetIndex;
          handleMoveContract(contractId, destinationStage, insertIndex);
        } else {
          // Dropped on column itself (empty area) - append to end
          handleMoveContract(contractId, destinationStage, -1);
        }
      },
    });
  }, [handleMoveContract]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button size="sm" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Sync Queue
          </Button>
        }
        breadcrumbs={[{ label: "Contracts" }]}
        title="Contracts"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition flex flex-col gap-6">
          {/* Stats bar */}
          <PipelineStats contracts={contracts} />

          {/* Pipeline board */}
          <PipelineBoard
            contracts={contracts}
            onAdvanceContract={handleAdvance}
            onSelectContract={handleSelect}
          />
        </div>
      </div>

      {/* Detail panel */}
      <ContractDetailPanel
        contract={selectedContract}
        onAdvance={handleAdvance}
        onClose={handleClosePanel}
        open={panelOpen}
      />
    </div>
  );
}
