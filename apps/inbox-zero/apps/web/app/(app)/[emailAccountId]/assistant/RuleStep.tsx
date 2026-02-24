import {
  ClockIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  SparklesIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils";

function DeleteButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <Button
      aria-label={ariaLabel}
      className="mt-1 size-8"
      onClick={onClick}
      size="icon"
      variant="ghost"
    >
      <TrashIcon className="size-4 text-muted-foreground" />
    </Button>
  );
}

function OptionsMenu({
  onAddDelay,
  onRemoveDelay,
  hasDelay,
  onUsePrompt,
  onUseLabel,
  isPromptMode,
  onSetManually,
  onUseAiDraft,
  isManualMode,
}: {
  onAddDelay?: () => void;
  onRemoveDelay?: () => void;
  hasDelay?: boolean;
  onUsePrompt?: () => void;
  onUseLabel?: () => void;
  isPromptMode?: boolean;
  onSetManually?: () => void;
  onUseAiDraft?: () => void;
  isManualMode?: boolean;
}) {
  const hasOptions =
    onAddDelay ||
    onRemoveDelay ||
    onUsePrompt ||
    onUseLabel ||
    onSetManually ||
    onUseAiDraft;

  if (!hasOptions) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="More options"
          className="mt-1 size-8"
          size="icon"
          variant="ghost"
        >
          <MoreHorizontalIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onUsePrompt && !isPromptMode && (
          <DropdownMenuItem onClick={onUsePrompt}>
            <SparklesIcon className="mr-2 size-4" />
            Use prompt
          </DropdownMenuItem>
        )}
        {onUseLabel && isPromptMode && (
          <DropdownMenuItem onClick={onUseLabel}>
            <SparklesIcon className="mr-2 size-4" />
            Use label
          </DropdownMenuItem>
        )}
        {onSetManually && !isManualMode && (
          <DropdownMenuItem onClick={onSetManually}>
            <PenLineIcon className="mr-2 size-4" />
            Set content manually
          </DropdownMenuItem>
        )}
        {onUseAiDraft && isManualMode && (
          <DropdownMenuItem onClick={onUseAiDraft}>
            <SparklesIcon className="mr-2 size-4" />
            Use AI draft
          </DropdownMenuItem>
        )}
        {onAddDelay && !hasDelay && (
          <DropdownMenuItem onClick={onAddDelay}>
            <ClockIcon className="mr-2 size-4" />
            Add delay
          </DropdownMenuItem>
        )}
        {onRemoveDelay && hasDelay && (
          <DropdownMenuItem onClick={onRemoveDelay}>
            <ClockIcon className="mr-2 size-4" />
            Remove delay
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionButtons({
  onRemove,
  removeAriaLabel,
  onAddDelay,
  onRemoveDelay,
  hasDelay,
  onUsePrompt,
  onUseLabel,
  isPromptMode,
  onSetManually,
  onUseAiDraft,
  isManualMode,
}: {
  onRemove: () => void;
  removeAriaLabel: string;
  onAddDelay?: () => void;
  onRemoveDelay?: () => void;
  hasDelay?: boolean;
  onUsePrompt?: () => void;
  onUseLabel?: () => void;
  isPromptMode?: boolean;
  onSetManually?: () => void;
  onUseAiDraft?: () => void;
  isManualMode?: boolean;
}) {
  return (
    <div className="flex items-start">
      <OptionsMenu
        hasDelay={hasDelay}
        isManualMode={isManualMode}
        isPromptMode={isPromptMode}
        onAddDelay={onAddDelay}
        onRemoveDelay={onRemoveDelay}
        onSetManually={onSetManually}
        onUseAiDraft={onUseAiDraft}
        onUseLabel={onUseLabel}
        onUsePrompt={onUsePrompt}
      />
      <DeleteButton ariaLabel={removeAriaLabel} onClick={onRemove} />
    </div>
  );
}

function CardLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row">{children}</div>;
}

function CardLayoutRight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-2", className)}>{children}</div>
  );
}

export function RuleStep({
  onRemove,
  leftContent,
  rightContent,
  removeAriaLabel,
  onAddDelay,
  onRemoveDelay,
  hasDelay,
  onUsePrompt,
  onUseLabel,
  isPromptMode,
  onSetManually,
  onUseAiDraft,
  isManualMode,
}: {
  onRemove: () => void;
  leftContent: React.ReactNode | null;
  rightContent: React.ReactNode;
  removeAriaLabel: string;
  onAddDelay?: () => void;
  onRemoveDelay?: () => void;
  hasDelay?: boolean;
  onUsePrompt?: () => void;
  onUseLabel?: () => void;
  isPromptMode?: boolean;
  onSetManually?: () => void;
  onUseAiDraft?: () => void;
  isManualMode?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative flex-1">
        <CardLayout>
          {leftContent && <div className="shrink-0">{leftContent}</div>}
          <CardLayoutRight>{rightContent}</CardLayoutRight>
          <ActionButtons
            hasDelay={hasDelay}
            isManualMode={isManualMode}
            isPromptMode={isPromptMode}
            onAddDelay={onAddDelay}
            onRemove={onRemove}
            onRemoveDelay={onRemoveDelay}
            onSetManually={onSetManually}
            onUseAiDraft={onUseAiDraft}
            onUseLabel={onUseLabel}
            onUsePrompt={onUsePrompt}
            removeAriaLabel={removeAriaLabel}
          />
        </CardLayout>
      </div>
    </div>
  );
}
