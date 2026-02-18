import type { PdfHighlighterUtils } from "@takeoff/pdf-takeoff/contexts/pdf-highlighter-context";
import type { TakeoffToolType } from "@takeoff/pdf-takeoff/types";
import type { Scaled } from "@takeoff/pdf-takeoff/types";

interface TakeoffDrawingPreviewProps {
  drawingPoints: Scaled[];
  getViewer: () => ReturnType<PdfHighlighterUtils["getViewer"]> | null;
  currentPageNumber: number | null;
  activeTool: TakeoffToolType | null;
  activeColor: string;
  cursorPosition: { x: number; y: number } | null;
}

export function TakeoffDrawingPreview({
  drawingPoints,
  getViewer,
  currentPageNumber,
  activeTool,
  activeColor,
  cursorPosition,
}: TakeoffDrawingPreviewProps) {
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
}
