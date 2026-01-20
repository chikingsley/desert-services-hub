import { FileText, GripVertical, Layers, Ungroup } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GeneratePDFOptions } from "@/lib/pdf/pdf-builder";

interface FloatingPdfOptionsProps {
  options: GeneratePDFOptions;
  onChange: (options: GeneratePDFOptions) => void;
}

export function FloatingPdfOptions({
  options,
  onChange,
}: FloatingPdfOptionsProps) {
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const toggleStyle = () => {
    onChange({
      ...options,
      style: options.style === "sectioned" ? "simple" : "sectioned",
    });
  };

  const toggleUnbreakable = () => {
    onChange({
      ...options,
      unbreakableSections: !options.unbreakableSections,
    });
  };

  const toggleBackPage = () => {
    onChange({
      ...options,
      includeBackPage: !options.includeBackPage,
    });
  };

  const isSectioned = options.style === "sectioned";
  const isUnbreakable = options.unbreakableSections ?? true;
  const hasBackPage = options.includeBackPage ?? false;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Draggable toolbar needs mouse events
    <div
      aria-label="PDF options"
      className="absolute z-50 rounded-lg border bg-background/95 shadow-lg backdrop-blur"
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      role="toolbar"
      style={{ left: position.x, top: position.y }}
    >
      {/* Drag handle */}
      <button
        className="flex w-full cursor-move items-center justify-center border-b px-3 py-1.5"
        onMouseDown={handleMouseDown}
        type="button"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="ml-1 font-medium text-xs">PDF Options</span>
      </button>

      {/* Option toggles */}
      <div className="p-2">
        <TooltipProvider>
          <div className="flex flex-col gap-1">
            {/* Style toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-auto w-full justify-start gap-2 px-2 py-1.5"
                  onClick={toggleStyle}
                  size="sm"
                  variant={isSectioned ? "secondary" : "ghost"}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span className="text-xs">Sections</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {isSectioned ? "ON" : "OFF"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Group items by section with subtotals</p>
              </TooltipContent>
            </Tooltip>

            {/* Unbreakable toggle - only show when sectioned */}
            {isSectioned && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-auto w-full justify-start gap-2 px-2 py-1.5"
                    onClick={toggleUnbreakable}
                    size="sm"
                    variant={isUnbreakable ? "secondary" : "ghost"}
                  >
                    <Ungroup className="h-4 w-4 shrink-0" />
                    <span className="text-xs">Keep Together</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {isUnbreakable ? "ON" : "OFF"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Keep sections together on same page</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Back page toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-auto w-full justify-start gap-2 px-2 py-1.5"
                  onClick={toggleBackPage}
                  size="sm"
                  variant={hasBackPage ? "secondary" : "ghost"}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="text-xs">Back Page</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {hasBackPage ? "ON" : "OFF"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Include catalog pricing page</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
