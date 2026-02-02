"use client";

import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DraggableCategoryProps {
  categoryId: string;
  categoryName: string;
  index: number;
  children: React.ReactNode;
  onDrop: (sourceIndex: number, targetIndex: number) => void;
}

type DragState =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement }
  | { type: "dragging" };

export function DraggableCategory({
  categoryId,
  categoryName,
  index,
  children,
  onDrop,
}: DraggableCategoryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [dragState, setDragState] = useState<DragState>({ type: "idle" });
  const [isDraggedOver, setIsDraggedOver] = useState<"top" | "bottom" | null>(
    null
  );

  useEffect(() => {
    const element = ref.current;
    const handle = handleRef.current;
    if (!(element && handle)) {
      return;
    }

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({ type: "category", categoryId, index }),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            getOffset: pointerOutsideOfPreview({
              x: "16px",
              y: "8px",
            }),
            render({ container }) {
              setDragState({ type: "preview", container });
              return () => setDragState({ type: "dragging" });
            },
            nativeSetDragImage,
          });
        },
        onDragStart: () => setDragState({ type: "dragging" }),
        onDrop: () => setDragState({ type: "idle" }),
      }),
      dropTargetForElements({
        element,
        getData: () => ({ type: "category", categoryId, index }),
        canDrop: ({ source }) => source.data.type === "category",
        onDragEnter: ({ source, self }) => {
          const sourceIndex = source.data.index as number;
          const targetIndex = self.data.index as number;
          setIsDraggedOver(sourceIndex < targetIndex ? "bottom" : "top");
        },
        onDragLeave: () => setIsDraggedOver(null),
        onDrop: ({ source }) => {
          setIsDraggedOver(null);
          const sourceIndex = source.data.index as number;
          if (sourceIndex !== index) {
            onDrop(sourceIndex, index);
          }
        },
      })
    );
  }, [categoryId, index, onDrop]);

  return (
    <>
      <div
        className={cn(
          "relative transition-all duration-200",
          dragState.type === "dragging" && "scale-[0.98] opacity-40",
          isDraggedOver === "top" &&
            "before:absolute before:-top-2 before:right-0 before:left-0 before:h-1 before:rounded-full before:bg-primary before:shadow-lg before:shadow-primary/30",
          isDraggedOver === "bottom" &&
            "after:absolute after:right-0 after:-bottom-2 after:left-0 after:h-1 after:rounded-full after:bg-primary after:shadow-lg after:shadow-primary/30"
        )}
        ref={ref}
      >
        <div className="absolute top-0 bottom-0 left-0 z-10 flex items-center px-2">
          <button
            aria-label="Drag to reorder"
            className="cursor-grab rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
            ref={handleRef}
            type="button"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
        <div className="pl-10">{children}</div>
      </div>

      {/* Custom drag preview portal */}
      {dragState.type === "preview" &&
        createPortal(
          <div
            className="min-w-[300px] max-w-[400px] rounded-xl border border-primary/30 bg-card px-5 py-4 shadow-2xl shadow-primary/20"
            style={{
              transform: "rotate(3deg)",
            }}
          >
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
              <span className="truncate font-display font-semibold">
                {categoryName}
              </span>
            </div>
          </div>,
          dragState.container
        )}
    </>
  );
}
