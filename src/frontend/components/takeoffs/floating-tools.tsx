"use client";

import { Circle, GripVertical, Ruler, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type PresetItem, SCALE_PRESETS } from "@/pages/takeoff-editor";

interface FloatingToolsProps {
  items: PresetItem[];
  selectedItem: PresetItem | null;
  onSelectItem: (item: PresetItem | null) => void;
  counts: Array<{
    id: string;
    label: string;
    color: string;
    value: number | string;
    count: number;
  }>;
  onClearAll: () => void;
  currentScaleId: string;
  onScaleChange: (scaleId: string) => void;
  currentPage: number;
  totalPages: number;
}

function getIconForType(type: string) {
  switch (type) {
    case "count":
      return Circle;
    case "linear":
      return Ruler;
    case "area":
      return Square;
    default:
      return Circle;
  }
}

function getTooltipText(type: string) {
  switch (type) {
    case "count":
      return "Click to count";
    case "linear":
      return "Click points, double-click to finish";
    case "area":
      return "Draw polygon, double-click to close";
    default:
      return "";
  }
}

export function FloatingTools({
  items,
  selectedItem,
  onSelectItem,
  counts,
  onClearAll,
  currentScaleId,
  onScaleChange,
  currentPage,
  totalPages,
}: FloatingToolsProps) {
  const [position, setPosition] = useState({ x: 16, y: 80 });
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

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Draggable toolbar needs mouse events
    <div
      aria-label="Takeoff tools"
      className="absolute z-50 rounded-lg border bg-background/95 shadow-lg backdrop-blur"
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      role="toolbar"
      style={{ left: position.x, top: position.y }}
    >
      {/* Drag handle */}
      <button
        className="flex w-full cursor-move items-center justify-center border-b px-2 py-1"
        onMouseDown={handleMouseDown}
        type="button"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="ml-1 font-medium text-xs">Tools</span>
      </button>

      {/* Page & Scale card */}
      <div className="border-b p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-xs">
            Page {currentPage}
            <span className="text-muted-foreground"> of {totalPages}</span>
          </span>
        </div>
        <div className="rounded-md border bg-muted/50 p-2">
          <p className="mb-1 font-medium text-[10px] text-muted-foreground uppercase">
            Scale for this page
          </p>
          <Select onValueChange={onScaleChange} value={currentScaleId}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALE_PRESETS.filter((s) => s.id !== "custom").map((scale) => (
                <SelectItem className="text-xs" key={scale.id} value={scale.id}>
                  {scale.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tool buttons - single column */}
      <div className="p-2">
        <TooltipProvider>
          <div className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = getIconForType(item.type);
              const isSelected = selectedItem?.id === item.id;
              const countData = counts.find((c) => c.id === item.id);

              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      className="relative h-auto w-full justify-start gap-2 px-2 py-1.5"
                      onClick={() => onSelectItem(isSelected ? null : item)}
                      size="sm"
                      variant={isSelected ? "secondary" : "ghost"}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: item.color }}
                      />
                      <span className="text-xs">{item.label}</span>
                      {countData && countData.count > 0 && (
                        <span
                          className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] text-white"
                          style={{ backgroundColor: item.color }}
                        >
                          {countData.count}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {getTooltipText(item.type)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Clear button */}
          {counts.length > 0 && (
            <>
              <div className="my-2 h-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="w-full text-destructive hover:text-destructive"
                    onClick={onClearAll}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Clear All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear all annotations</TooltipContent>
              </Tooltip>
            </>
          )}
        </TooltipProvider>
      </div>

      {/* Counts summary */}
      {counts.length > 0 && (
        <div className="border-t px-2 py-1.5">
          <p className="mb-1 font-medium text-[10px] text-muted-foreground uppercase">
            Summary
          </p>
          <div className="space-y-0.5">
            {counts.map((item) => (
              <div
                className="flex items-center justify-between text-xs"
                key={item.id}
              >
                <div className="flex items-center gap-1">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.label}</span>
                </div>
                <span className="font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
