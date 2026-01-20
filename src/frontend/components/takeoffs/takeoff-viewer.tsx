"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PdfHighlighter,
  type PdfHighlighterUtils,
  PdfLoader,
  type Scaled,
  type ScaledPosition,
  scaledPositionToViewport,
  type TakeoffAnnotation,
  type TakeoffToolType,
  type ViewportPosition,
  viewportPositionToScaled,
} from "@/lib/pdf-takeoff";

// Note: pdfjs-dist CSS is loaded via CDN in layout/head to avoid SVG reference issues
import "@/lib/pdf-takeoff/style/PdfHighlighter.css";
import "@/lib/pdf-takeoff/style/pdf_viewer.css";

interface TakeoffViewerProps {
  pdfUrl: string;
  activeTool: TakeoffToolType | null;
  activeItemId: string;
  activeItemLabel: string;
  activeColor: string;
  annotations: TakeoffAnnotation[];
  onAnnotationAdd: (annotation: TakeoffAnnotation) => void;
  onAnnotationDelete?: (id: string) => void;
  onAnnotationUpdate?: (
    id: string,
    updates: Partial<TakeoffAnnotation>
  ) => void;
  onToolClear: () => void;
  getNextNumber: (itemId: string) => number;
  onPageChange?: (pageNumber: number, totalPages: number) => void;
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

  // Handle escape to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawingPoints([]);
        setCurrentPageNumber(null);
        setCursorPosition(null);
        onToolClear();
      } else if (e.key === "Enter" && drawingPoints.length > 0) {
        handlePdfDoubleClick();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawingPoints, handlePdfDoubleClick, onToolClear]);

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

      const ann = annotations.find((a) => a.id === dragging.id);
      if (!ann) {
        return;
      }

      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;

      if (ann.type === "count") {
        const pageView = viewer.getPageView(
          ann.position.boundingRect.pageNumber - 1
        );
        if (!pageView) {
          return;
        }

        const viewport = pageView.viewport;
        const scaledDeltaX =
          (deltaX / viewport.width) * ann.position.boundingRect.width;
        const scaledDeltaY =
          (deltaY / viewport.height) * ann.position.boundingRect.height;

        const newPosition: ScaledPosition = {
          ...ann.position,
          boundingRect: {
            ...ann.position.boundingRect,
            x1: ann.position.boundingRect.x1 + scaledDeltaX,
            y1: ann.position.boundingRect.y1 + scaledDeltaY,
            x2: ann.position.boundingRect.x2 + scaledDeltaX,
            y2: ann.position.boundingRect.y2 + scaledDeltaY,
          },
        };
        onAnnotationUpdate?.(ann.id, { position: newPosition });
      } else if (
        (ann.type === "polyline" || ann.type === "polygon") &&
        ann.points.length > 0
      ) {
        const pageView = viewer.getPageView(ann.points[0].pageNumber - 1);
        if (!pageView) {
          return;
        }

        const viewport = pageView.viewport;
        const newPoints = ann.points.map((p) => ({
          ...p,
          x1: p.x1 + (deltaX / viewport.width) * p.width,
          y1: p.y1 + (deltaY / viewport.height) * p.height,
        }));
        onAnnotationUpdate?.(ann.id, { points: newPoints });
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
  }, [dragging, annotations, getViewer, onAnnotationUpdate]);

  // Inject annotations into PDF page layers
  useEffect(() => {
    if (!viewerReady) {
      return;
    }
    const viewer = getViewer();
    if (!viewer) {
      return;
    }

    // Clean up previous annotation elements
    for (const el of document.querySelectorAll(".takeoff-annotation-layer")) {
      el.remove();
    }

    // Group annotations by page
    const annotationsByPage: Record<number, TakeoffAnnotation[]> = {};
    const safeAnnotations = Array.isArray(annotations) ? annotations : [];
    for (const ann of safeAnnotations) {
      const pageNum =
        ann.type === "count"
          ? ann.position.boundingRect.pageNumber
          : ann.points[0]?.pageNumber;
      if (pageNum) {
        if (!annotationsByPage[pageNum]) {
          annotationsByPage[pageNum] = [];
        }
        annotationsByPage[pageNum].push(ann);
      }
    }

    // Create annotation layers for each page
    for (const [pageNumStr, pageAnnotations] of Object.entries(
      annotationsByPage
    )) {
      const pageNum = Number(pageNumStr);
      const pageView = viewer.getPageView(pageNum - 1);
      if (!pageView?.div) {
        continue;
      }

      const viewport = pageView.viewport;

      // Create or find annotation layer
      let layer = pageView.div.querySelector(
        ".takeoff-annotation-layer"
      ) as HTMLDivElement;
      if (!layer) {
        layer = document.createElement("div");
        layer.className = "takeoff-annotation-layer";
        layer.style.cssText =
          "position: absolute; inset: 0; pointer-events: none; z-index: 5;";
        pageView.div.style.position = "relative";
        pageView.div.appendChild(layer);
      }

      // Render annotations
      for (const ann of pageAnnotations) {
        if (ann.type === "count") {
          const viewportPos = scaledPositionToViewport(ann.position, viewer);
          const { left, top, width, height } = viewportPos.boundingRect;

          const marker = document.createElement("div");
          marker.className = "takeoff-count-marker";
          marker.dataset.annotationId = ann.id;
          marker.style.cssText = `
            position: absolute;
            left: ${left + width / 2}px;
            top: ${top + height / 2}px;
            transform: translate(-50%, -50%);
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background-color: ${ann.color};
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            cursor: ${activeTool ? "crosshair" : "grab"};
            pointer-events: auto;
            user-select: none;
          `;
          marker.textContent = String(ann.number);
          layer.appendChild(marker);
        } else if (ann.type === "polyline" && ann.points.length >= 2) {
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
          );
          svg.setAttribute("class", "takeoff-polyline");
          svg.dataset.annotationId = ann.id;
          svg.style.cssText = `
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            cursor: ${activeTool ? "crosshair" : "grab"};
          `;

          const viewportPoints = ann.points.map((p) => ({
            x: (viewport.width * p.x1) / p.width,
            y: (viewport.height * p.y1) / p.height,
          }));

          const pathD = viewportPoints
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
            .join(" ");

          const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
          );
          path.setAttribute("d", pathD);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", ann.color);
          path.setAttribute("stroke-width", String(ann.strokeWidth));
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          path.style.pointerEvents = "stroke";
          path.style.cursor = activeTool ? "crosshair" : "grab";

          svg.appendChild(path);
          layer.appendChild(svg);
        } else if (ann.type === "polygon" && ann.points.length >= 3) {
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
          );
          svg.setAttribute("class", "takeoff-polygon");
          svg.dataset.annotationId = ann.id;
          svg.style.cssText = `
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          `;

          const viewportPoints = ann.points.map((p) => ({
            x: (viewport.width * p.x1) / p.width,
            y: (viewport.height * p.y1) / p.height,
          }));

          const pointsStr = viewportPoints
            .map((p) => `${p.x},${p.y}`)
            .join(" ");

          const polygon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon"
          );
          polygon.setAttribute("points", pointsStr);
          polygon.setAttribute("fill", ann.color);
          polygon.setAttribute("fill-opacity", String(ann.fillOpacity));
          polygon.setAttribute("stroke", ann.color);
          polygon.setAttribute("stroke-width", String(ann.strokeWidth));
          polygon.setAttribute("stroke-linejoin", "round");
          polygon.style.pointerEvents = "fill";
          polygon.style.cursor = activeTool ? "crosshair" : "grab";

          svg.appendChild(polygon);
          layer.appendChild(svg);
        }
      }
    }

    // Add event listeners to annotation elements
    const handleAnnotationMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const annotationEl = target.closest(
        "[data-annotation-id]"
      ) as HTMLElement;
      if (!annotationEl) {
        return;
      }

      const annId = annotationEl.dataset.annotationId;
      const ann = annotations.find((a) => a.id === annId);
      if (!ann || activeTool) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setDragging({
        id: ann.id,
        startX: e.clientX,
        startY: e.clientY,
        type: ann.type,
      });
    };

    const handleAnnotationContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const annotationEl = target.closest(
        "[data-annotation-id]"
      ) as HTMLElement;
      if (!annotationEl) {
        return;
      }

      e.preventDefault();
      const annId = annotationEl.dataset.annotationId;
      if (annId) {
        onAnnotationDelete?.(annId);
      }
    };

    for (const layer of document.querySelectorAll(
      ".takeoff-annotation-layer"
    )) {
      layer.addEventListener(
        "mousedown",
        handleAnnotationMouseDown as EventListener
      );
      layer.addEventListener(
        "contextmenu",
        handleAnnotationContextMenu as EventListener
      );
    }

    return () => {
      for (const layer of document.querySelectorAll(
        ".takeoff-annotation-layer"
      )) {
        layer.removeEventListener(
          "mousedown",
          handleAnnotationMouseDown as EventListener
        );
        layer.removeEventListener(
          "contextmenu",
          handleAnnotationContextMenu as EventListener
        );
      }
    };
  }, [viewerReady, annotations, activeTool, getViewer, onAnnotationDelete]);

  // Render current drawing preview
  const renderDrawingPreview = () => {
    if (drawingPoints.length === 0) {
      return null;
    }

    const viewer = getViewer();
    if (!(viewer && currentPageNumber)) {
      return null;
    }

    const pageView = viewer.getPageView(currentPageNumber - 1);
    if (!pageView?.div) {
      return null;
    }

    const pageRect = pageView.div.getBoundingClientRect();
    const viewport = pageView.viewport;

    const viewportPoints = drawingPoints.map((p, i) => ({
      // Include index to guarantee uniqueness even for duplicate coordinates
      id: `${i}-${p.x1.toFixed(4)}-${p.y1.toFixed(4)}`,
      x: (viewport.width * p.x1) / p.width,
      y: (viewport.height * p.y1) / p.height,
    }));

    if (activeTool === "polyline") {
      const pathD = viewportPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ");

      const lastPoint = viewportPoints.at(-1);

      return (
        <svg
          aria-hidden="true"
          style={{
            position: "fixed",
            left: pageRect.left,
            top: pageRect.top,
            width: pageRect.width,
            height: pageRect.height,
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          <title>Polyline drawing preview</title>
          {/* Placed segments */}
          <path
            d={pathD}
            fill="none"
            stroke={activeColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          {/* Live cursor line */}
          {cursorPosition && lastPoint && (
            <line
              stroke={activeColor}
              strokeDasharray="5,5"
              strokeLinecap="round"
              strokeWidth={3}
              x1={lastPoint.x}
              x2={cursorPosition.x}
              y1={lastPoint.y}
              y2={cursorPosition.y}
            />
          )}
          {/* Points */}
          {viewportPoints.map((p) => (
            <circle cx={p.x} cy={p.y} fill={activeColor} key={p.id} r={4} />
          ))}
          {/* Cursor point */}
          {cursorPosition && (
            <circle
              cx={cursorPosition.x}
              cy={cursorPosition.y}
              fill={activeColor}
              fillOpacity={0.5}
              r={4}
            />
          )}
        </svg>
      );
    }

    if (activeTool === "polygon") {
      // Include cursor in points for live preview
      const allPoints = cursorPosition
        ? [...viewportPoints, cursorPosition]
        : viewportPoints;
      const pointsStr = allPoints.map((p) => `${p.x},${p.y}`).join(" ");
      const lastPoint = viewportPoints.at(-1);
      const firstPoint = viewportPoints[0];

      return (
        <svg
          aria-hidden="true"
          style={{
            position: "fixed",
            left: pageRect.left,
            top: pageRect.top,
            width: pageRect.width,
            height: pageRect.height,
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          <title>Polygon drawing preview</title>
          {/* Filled preview including cursor */}
          <polygon
            fill={activeColor}
            fillOpacity={0.1}
            points={pointsStr}
            stroke={activeColor}
            strokeWidth={2}
          />
          {/* Dashed line from last point to cursor */}
          {cursorPosition && lastPoint && (
            <line
              stroke={activeColor}
              strokeDasharray="5,5"
              strokeWidth={2}
              x1={lastPoint.x}
              x2={cursorPosition.x}
              y1={lastPoint.y}
              y2={cursorPosition.y}
            />
          )}
          {/* Dashed line from cursor to first point (closing preview) */}
          {cursorPosition && firstPoint && viewportPoints.length >= 2 && (
            <line
              stroke={activeColor}
              strokeDasharray="5,5"
              strokeOpacity={0.5}
              strokeWidth={2}
              x1={cursorPosition.x}
              x2={firstPoint.x}
              y1={cursorPosition.y}
              y2={firstPoint.y}
            />
          )}
          {/* Points */}
          {viewportPoints.map((p) => (
            <circle cx={p.x} cy={p.y} fill={activeColor} key={p.id} r={4} />
          ))}
          {/* Cursor point */}
          {cursorPosition && (
            <circle
              cx={cursorPosition.x}
              cy={cursorPosition.y}
              fill={activeColor}
              fillOpacity={0.5}
              r={4}
            />
          )}
        </svg>
      );
    }

    return null;
  };

  return (
    <div
      aria-label="PDF takeoff canvas"
      className="takeoff-viewer relative h-full w-full"
      onClick={handlePdfClick}
      onDoubleClick={handlePdfDoubleClick}
      onMouseMove={handleMouseMove}
      role="application"
      style={{ cursor: activeTool ? "crosshair" : "default" }}
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
      {renderDrawingPreview()}

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

      <style jsx>{`
        .takeoff-viewer {
          position: relative;
          overflow: hidden;
        }
        .takeoff-viewer :global(.PdfHighlighter) {
          height: 100%;
          width: 100%;
          overflow: auto;
        }
      `}</style>
    </div>
  );
}
