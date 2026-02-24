"use client";

import { PdfHighlighter } from "@takeoff/pdf-takeoff/components/pdf-highlighter";
import { PdfLoader } from "@takeoff/pdf-takeoff/components/pdf-loader";
import type { PdfHighlighterUtils } from "@takeoff/pdf-takeoff/contexts/pdf-highlighter-context";
import { viewportPositionToScaled } from "@takeoff/pdf-takeoff/lib/coordinates";
import type {
  Scaled,
  TakeoffAnnotation,
  TakeoffToolType,
  ViewportPosition,
} from "@takeoff/pdf-takeoff/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  attachAnnotationListeners,
  computeDragUpdate,
  injectAnnotationLayers,
} from "@/apps/web/frontend/components/takeoffs/takeoff-annotations";
import { TakeoffDrawingPreview } from "@/apps/web/frontend/components/takeoffs/takeoff-drawing-preview";

// Note: pdfjs-dist CSS is loaded via CDN in layout/head to avoid SVG reference issues
import "@takeoff/pdf-takeoff/style/PdfHighlighter.css";
import "@takeoff/pdf-takeoff/style/pdf_viewer.css";

interface TakeoffViewerProps {
  activeColor: string;
  activeItemId: string;
  activeItemLabel: string;
  activeTool: TakeoffToolType | null;
  annotations: TakeoffAnnotation[];
  getNextNumber: (itemId: string) => number;
  onAnnotationAdd: (annotation: TakeoffAnnotation) => void;
  onAnnotationDelete?: (id: string) => void;
  onAnnotationUpdate?: (
    id: string,
    updates: Partial<TakeoffAnnotation>
  ) => void;
  onPageChange?: (pageNumber: number, totalPages: number) => void;
  onToolClear: () => void;
  pdfUrl: string;
}

export function TakeoffViewer({
  pdfUrl,
  activeTool,
  activeItemId,
  activeItemLabel,
  activeColor,
  annotations,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationUpdate,
  onToolClear,
  getNextNumber,
  onPageChange,
}: TakeoffViewerProps) {
  const highlighterUtilsRef = useRef<PdfHighlighterUtils | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [, forceUpdate] = useState(0);

  // For polyline/polygon drawing
  const [drawingPoints, setDrawingPoints] = useState<Scaled[]>([]);
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(
    null
  );
  const [cursorPosition, setCursorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // For dragging annotations
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    type: "count" | "polyline" | "polygon";
  } | null>(null);

  // O(1) annotation lookup by id (avoids linear scan on every drag mousemove)
  const annotationById = useMemo(() => {
    const map = new Map<string, TakeoffAnnotation>();
    for (const ann of annotations) {
      map.set(ann.id, ann);
    }
    return map;
  }, [annotations]);

  const getViewer = useCallback(() => {
    return highlighterUtilsRef.current?.getViewer() ?? null;
  }, []);

  // Force re-render on zoom changes
  useEffect(() => {
    if (!viewerReady) {
      return;
    }
    const viewer = getViewer();
    if (!viewer) {
      return;
    }

    const handleUpdate = () => forceUpdate((n) => n + 1);

    // Listen for page render events (happens on zoom)
    viewer.eventBus?.on("pagerendered", handleUpdate);
    window.addEventListener("resize", handleUpdate);

    return () => {
      viewer.eventBus?.off("pagerendered", handleUpdate);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [viewerReady, getViewer]);

  // Track page changes
  useEffect(() => {
    if (!(viewerReady && onPageChange)) {
      return;
    }
    const viewer = getViewer();
    if (!viewer) {
      return;
    }

    // Report initial page
    onPageChange(viewer.currentPageNumber || 1, viewer.pagesCount || 1);

    const handlePageChange = (e: { pageNumber: number }) => {
      onPageChange(e.pageNumber, viewer.pagesCount || 1);
    };

    viewer.eventBus?.on("pagechanging", handlePageChange);

    return () => {
      viewer.eventBus?.off("pagechanging", handlePageChange);
    };
  }, [viewerReady, getViewer, onPageChange]);

  // Find page from click coordinates
  const findPageFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const viewer = getViewer();
      if (!viewer) {
        return null;
      }

      for (let i = 0; i < viewer.pagesCount; i++) {
        const pageView = viewer.getPageView(i);
        if (!pageView?.div) {
          continue;
        }

        const rect = pageView.div.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return { pageNumber: i + 1, rect, pageView };
        }
      }
      return null;
    },
    [getViewer]
  );

  // Handle click on PDF for placing annotations
  const handlePdfClick = useCallback(
    (e: React.MouseEvent) => {
      if (!activeTool) {
        return;
      }

      const pageInfo = findPageFromPoint(e.clientX, e.clientY);
      if (!pageInfo) {
        return;
      }

      const viewer = getViewer();
      if (!viewer) {
        return;
      }

      const clickX = e.clientX - pageInfo.rect.left;
      const clickY = e.clientY - pageInfo.rect.top;

      if (activeTool === "count") {
        // Place count marker
        const viewportPosition: ViewportPosition = {
          boundingRect: {
            left: clickX - 14,
            top: clickY - 14,
            width: 28,
            height: 28,
            pageNumber: pageInfo.pageNumber,
          },
          rects: [],
        };
        const scaledPosition = viewportPositionToScaled(
          viewportPosition,
          viewer
        );

        const annotation: TakeoffAnnotation = {
          id: `count-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          type: "count",
          position: scaledPosition,
          itemId: activeItemId,
          label: activeItemId,
          color: activeColor,
          number: getNextNumber(activeItemId),
        };
        onAnnotationAdd(annotation);
      } else if (activeTool === "polyline" || activeTool === "polygon") {
        // Add point to current drawing
        const viewport = pageInfo.pageView.viewport;
        const scaledPoint: Scaled = {
          x1: clickX,
          y1: clickY,
          x2: clickX,
          y2: clickY,
          width: viewport.width,
          height: viewport.height,
          pageNumber: pageInfo.pageNumber,
        };

        if (currentPageNumber === null) {
          setCurrentPageNumber(pageInfo.pageNumber);
          setDrawingPoints([scaledPoint]);
        } else if (currentPageNumber === pageInfo.pageNumber) {
          setDrawingPoints((prev) => [...prev, scaledPoint]);
        }
      }
    },
    [
      activeTool,
      activeItemId,
      activeColor,
      getNextNumber,
      onAnnotationAdd,
      findPageFromPoint,
      getViewer,
      currentPageNumber,
    ]
  );

  // Handle double-click to finish polyline/polygon
  const handlePdfDoubleClick = useCallback(() => {
    if (!activeTool || activeTool === "count") {
      return;
    }

    if (activeTool === "polyline" && drawingPoints.length >= 2) {
      const annotation: TakeoffAnnotation = {
        id: `polyline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "polyline",
        points: drawingPoints,
        itemId: activeItemId,
        label: activeItemId,
        color: activeColor,
        strokeWidth: 3,
      };
      onAnnotationAdd(annotation);
    } else if (activeTool === "polygon" && drawingPoints.length >= 3) {
      const annotation: TakeoffAnnotation = {
        id: `polygon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "polygon",
        points: drawingPoints,
        itemId: activeItemId,
        label: activeItemId,
        color: activeColor,
        strokeWidth: 2,
        fillOpacity: 0.2,
      };
      onAnnotationAdd(annotation);
    }

    setDrawingPoints([]);
    setCurrentPageNumber(null);
    setCursorPosition(null);
  }, [activeTool, drawingPoints, activeItemId, activeColor, onAnnotationAdd]);

  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Escape") {
        onToolClear();
      }
    },
    [onToolClear]
  );

  // Handle mouse move for live preview
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!activeTool || activeTool === "count" || drawingPoints.length === 0) {
        setCursorPosition(null);
        return;
      }

      const pageInfo = findPageFromPoint(e.clientX, e.clientY);
      if (!pageInfo || pageInfo.pageNumber !== currentPageNumber) {
        setCursorPosition(null);
        return;
      }

      setCursorPosition({
        x: e.clientX - pageInfo.rect.left,
        y: e.clientY - pageInfo.rect.top,
      });
    },
    [activeTool, drawingPoints.length, currentPageNumber, findPageFromPoint]
  );

  // Refs for stable keydown listener (avoids teardown/re-register on every point add)
  const drawingPointsRef = useRef(drawingPoints);
  drawingPointsRef.current = drawingPoints;
  const handlePdfDoubleClickRef = useRef(handlePdfDoubleClick);
  handlePdfDoubleClickRef.current = handlePdfDoubleClick;
  const onToolClearRef = useRef(onToolClear);
  onToolClearRef.current = onToolClear;

  // Handle escape to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawingPoints([]);
        setCurrentPageNumber(null);
        setCursorPosition(null);
        onToolClearRef.current();
      } else if (e.key === "Enter" && drawingPointsRef.current.length > 0) {
        handlePdfDoubleClickRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle drag start
  const _handleDragStart = useCallback(
    (
      e: React.MouseEvent,
      annId: string,
      type: "count" | "polyline" | "polygon"
    ) => {
      if (activeTool) {
        return; // Don't drag while tool is active
      }
      e.preventDefault();
      e.stopPropagation();
      setDragging({ id: annId, startX: e.clientX, startY: e.clientY, type });
    },
    [activeTool]
  );

  // Handle drag move and end
  useEffect(() => {
    if (!dragging) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const viewer = getViewer();
      if (!viewer) {
        return;
      }

      const ann = annotationById.get(dragging.id);
      if (!ann) {
        return;
      }

      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;

      const updates = computeDragUpdate(ann, viewer, deltaX, deltaY);
      if (updates) {
        onAnnotationUpdate?.(ann.id, updates);
      }

      setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, annotationById, getViewer, onAnnotationUpdate]);

  // Inject annotations into PDF page layers
  useEffect(() => {
    if (!viewerReady) {
      return;
    }
    const viewer = getViewer();
    if (!viewer) {
      return;
    }

    injectAnnotationLayers(viewer, annotations, activeTool);

    return attachAnnotationListeners(
      annotationById,
      activeTool,
      (id, clientX, clientY, type) => {
        setDragging({ id, startX: clientX, startY: clientY, type });
      },
      onAnnotationDelete
    );
  }, [
    viewerReady,
    annotations,
    activeTool,
    getViewer,
    onAnnotationDelete,
    annotationById,
  ]);

  return (
    <button
      aria-label="PDF takeoff canvas"
      className="takeoff-viewer relative h-full w-full"
      onClick={handlePdfClick}
      onDoubleClick={handlePdfDoubleClick}
      onKeyDown={handleCanvasKeyDown}
      onMouseMove={handleMouseMove}
      style={{ cursor: activeTool ? "crosshair" : "default" }}
      type="button"
    >
      <PdfLoader
        beforeLoad={() => (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading PDF...
          </div>
        )}
        document={pdfUrl}
      >
        {(pdfDocument) => (
          <PdfHighlighter
            highlights={[]}
            pdfDocument={pdfDocument}
            style={{ height: "100%", width: "100%" }}
            utilsRef={(utils) => {
              highlighterUtilsRef.current = utils;
              if (utils?.getViewer() && !viewerReady) {
                setTimeout(() => setViewerReady(true), 100);
              }
            }}
          >
            <div />
          </PdfHighlighter>
        )}
      </PdfLoader>

      {/* Drawing preview */}
      <TakeoffDrawingPreview
        activeColor={activeColor}
        activeTool={activeTool}
        currentPageNumber={currentPageNumber}
        cursorPosition={cursorPosition}
        drawingPoints={drawingPoints}
        getViewer={getViewer}
      />

      {/* Tool hint */}
      {activeTool && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: activeColor }}
          />
          <span className="font-medium text-sm">{activeItemLabel}</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-sm">
            {activeTool === "count" && "Click to place"}
            {activeTool === "polyline" &&
              `${drawingPoints.length} pts · Double-click or Enter to finish`}
            {activeTool === "polygon" &&
              `${drawingPoints.length} pts · Double-click or Enter to close`}
          </span>
          <span className="text-muted-foreground text-xs">(Esc to cancel)</span>
        </div>
      )}

      {/* Scoped styles for PDF viewer */}
      <style>
        {`
        .takeoff-viewer {
          position: relative;
          overflow: hidden;
        }
        .takeoff-viewer .PdfHighlighter {
          height: 100%;
          width: 100%;
          overflow: auto;
        }
        `}
      </style>
    </button>
  );
}
