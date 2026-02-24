import { ArchiveIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { ButtonGroup } from "@/components/ButtonGroup";
import { LoadingMiniSpinner } from "@/components/Loading";

export function ActionButtonsBulk(props: {
  isPlanning: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  onPlanAiAction: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const {
    isPlanning,
    isArchiving,
    isDeleting,
    onPlanAiAction,
    onArchive,
    onDelete,
  } = props;

  const buttons = useMemo(
    () => [
      {
        tooltip: "Process with assistant",
        onClick: onPlanAiAction,
        icon: isPlanning ? (
          <LoadingMiniSpinner />
        ) : (
          <SparklesIcon aria-hidden="true" className="size-4 text-foreground" />
        ),
      },
      {
        tooltip: "Archive",
        onClick: onArchive,
        icon: isArchiving ? (
          <LoadingMiniSpinner />
        ) : (
          <ArchiveIcon aria-hidden="true" className="size-4 text-foreground" />
        ),
      },
      {
        tooltip: "Delete",
        onClick: onDelete,
        icon: isDeleting ? (
          <LoadingMiniSpinner />
        ) : (
          <Trash2Icon aria-hidden="true" className="size-4 text-foreground" />
        ),
      },
    ],
    [isArchiving, isPlanning, isDeleting, onArchive, onPlanAiAction, onDelete]
  );

  return <ButtonGroup buttons={buttons} />;
}
