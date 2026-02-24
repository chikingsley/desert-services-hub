"use client";

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  LightbulbIcon,
  PlusIcon,
} from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useState } from "react";
import { getPersonas } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { ButtonList } from "@/components/ButtonList";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  convertLabelsToDisplay,
  convertMentionsToLabels,
} from "@/utils/mention";

interface ExamplesDialogProps {
  children?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  setInput: (input: string) => void;
}

export function ExamplesDialog({
  setInput,
  children,
  open,
  onOpenChange,
}: ExamplesDialogProps) {
  const { provider } = useAccount();
  const personas = getPersonas(provider);
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedExamples, setSelectedExamples] = useState<number[]>([]);

  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const handleExampleToggle = (index: number) => {
    setSelectedExamples((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      return [...prev, index];
    });
  };

  const handleAddSelected = () => {
    if (!selectedPersona || selectedExamples.length === 0) {
      return;
    }

    const persona = personas[selectedPersona as keyof typeof personas];

    if (selectedExamples.length === 1) {
      // Single selection - use the example directly
      const selectedExample = persona.promptArray[selectedExamples[0]];
      setInput(convertMentionsToLabels(selectedExample));
    } else {
      // Multiple selections - format as "add the following rules:"
      const selectedRules = selectedExamples.map((index) =>
        convertMentionsToLabels(persona.promptArray[index])
      );
      const formattedPrompt = `Add the following rules:\n${selectedRules.map((rule) => `- ${rule}`).join("\n")}`;
      setInput(formattedPrompt);
    }

    setIsOpen(false);
    setSelectedExamples([]);
  };

  const [selectedPersona, setSelectedPersona] = useQueryState(
    "persona",
    parseAsStringEnum(Object.keys(personas))
  );

  const handleBackToPersonas = () => {
    setSelectedPersona(null);
    setSelectedExamples([]);
  };

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <Tooltip content="Choose from examples">
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost">
              <LightbulbIcon className="size-5" />
              <span className="sr-only">Show Examples</span>
            </Button>
          </DialogTrigger>
        </Tooltip>
      )}
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {selectedPersona && (
              <Button
                className="h-8 w-8"
                onClick={handleBackToPersonas}
                size="icon"
                variant="ghost"
              >
                <ArrowLeftIcon className="size-4" />
                <span className="sr-only">Back to personas</span>
              </Button>
            )}
            <DialogTitle>
              {selectedPersona ? "Choose examples" : "Choose persona"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {selectedPersona ? (
          <div className="flex min-h-0 flex-col space-y-4">
            <ScrollArea className="max-h-[50vh] flex-1">
              <div className="space-y-3 pr-4">
                {personas[
                  selectedPersona as keyof typeof personas
                ].promptArray.map((example, index) => {
                  const isSelected = selectedExamples.includes(index);
                  return (
                    <Button
                      className={cn(
                        "relative h-auto min-h-[2.5rem] w-full justify-start text-wrap px-4 py-3 text-left text-sm leading-relaxed",
                        isSelected &&
                          "border-green-500 bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-950/30"
                      )}
                      key={index}
                      onClick={() => handleExampleToggle(index)}
                      variant="outline"
                    >
                      <div className="flex w-full items-start gap-3">
                        {isSelected && (
                          <div className="mt-0.5 flex-shrink-0">
                            <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400" />
                          </div>
                        )}
                        <span className="flex-1 whitespace-pre-wrap">
                          {convertLabelsToDisplay(example)}
                        </span>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedExamples.length > 0 && (
              <div className="flex justify-end pt-4">
                <Button
                  className="gap-2"
                  onClick={handleAddSelected}
                  variant="default"
                >
                  <PlusIcon className="size-4" />
                  Add Selected ({selectedExamples.length})
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ButtonList
            columns={3}
            emptyMessage=""
            items={Object.entries(personas).map(([id, persona]) => ({
              id,
              name: persona.label,
            }))}
            onSelect={(id) => setSelectedPersona(id as keyof typeof personas)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
