import type { PDFViewer as TPDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import {
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { viewportToScaled } from "../lib/coordinates";
import type { LTWHP, Scaled } from "../types";

/**
 * The props type for {@link PolygonCanvas}.
 *
 * @category Component Properties
 */
export interface PolygonCanvasProps {
  /**
   * Whether polygon mode is active.
   */
  isActive: boolean;

  /**
   * Stroke color for the polygon.
   * @default "#8b5cf6"
   */
  strokeColor?: string;

  /**
   * Fill color for the polygon.
   * @default strokeColor with 20% opacity
   */
  fillColor?: string;

  /**
   * Fill opacity for the polygon.
   * @default 0.2
   */
  fillOpacity?: number;

  /**
   * Stroke width for the polygon.
   * @default 2
   */
  strokeWidth?: number;

  /**
   * The PDF viewer instance.
   */
  viewer: InstanceType<typeof TPDFViewer>;

  /**
   * Callback when polygon is complete.
   *
   * @param points - Array of scaled points forming the polygon.
   */
  onComplete: (points: Scaled[]) => void;

  /**
   * Callback when polygon creation is cancelled.
   */
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
  pageNumber: number;
}

/**
 * A transparent overlay for creating polygon annotations on PDF pages.
 * Click to add points, double-click or click near start point to close.
 *
 * @category Component
 */
export const PolygonCanvas = ({
  isActive,
  strokeColor = "#8b5cf6",
  fillColor,
  fillOpacity = 0.2,
  strokeWidth = 2,
  viewer,
  onComplete,
  onCancel,
}: PolygonCanvasProps) => {
  const [points, setPoints] = useState<Point[]>([]);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [pageRect, setPageRect] = useState<DOMRect | null>(null);
  const lastClickTimeRef = useRef<number>(0);

  const actualFillColor = fillColor || strokeColor;

  // Check if a point is close to the start point (to close polygon)
  const isNearStartPoint = useCallback(
    (x: number, y: number) => {
      if (points.length < 3) return false;
      const start = points[0];
      const distance = Math.sqrt((x - start.x) ** 2 + (y - start.y) ** 2);
      return distance < 15; // 15px threshold
    },
    [points]
  );

  // Find which page the user is interacting with
  const findPageFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewer) return null;

      for (let i = 0; i < viewer.pagesCount; i++) {
        const pageView = viewer.getPageView(i);
        if (!pageView?.div) continue;

        const rect = pageView.div.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return {
            pageNumber: i + 1,
            element: pageView.div as HTMLElement,
            rect,
          };
        }
      }
      return null;
    },
    [viewer]
  );

  // Finish the polygon
  const finishPolygon = useCallback(() => {
    if (points.length < 3 || !viewer) {
      setPoints([]);
      setCurrentPoint(null);
      return;
    }

    // Convert points to scaled coordinates
    const scaledPoints: Scaled[] = points.map((pt) => {
      const pageView = viewer.getPageView(pt.pageNumber - 1);
      const viewport = pageView.viewport;
      const rect: LTWHP = {
        left: pt.x,
        top: pt.y,
        width: 1,
        height: 1,
        pageNumber: pt.pageNumber,
      };
      return viewportToScaled(rect, viewport);
    });

    onComplete(scaledPoints);
    setPoints([]);
    setCurrentPoint(null);
    setPageRect(null);
  }, [points, viewer, onComplete]);

  // Handle click to add point or finish
  const handleClick = useCallback(
    (clientX: number, clientY: number) => {
      const now = Date.now();
      const isDoubleClick = now - lastClickTimeRef.current < 300;
      lastClickTimeRef.current = now;

      const pageInfo = findPageFromPoint(clientX, clientY);
      if (!pageInfo) return;

      const clickX = clientX - pageInfo.rect.left;
      const clickY = clientY - pageInfo.rect.top;

      // Check for double-click or click near start to close
      if (
        (isDoubleClick || isNearStartPoint(clickX, clickY)) &&
        points.length >= 3
      ) {
        finishPolygon();
        return;
      }

      // If we have points on a different page, don't allow cross-page polygons
      if (points.length > 0 && points[0].pageNumber !== pageInfo.pageNumber) {
        return;
      }

      setPageRect(pageInfo.rect);
      const newPoint: Point = {
        x: clickX,
        y: clickY,
        pageNumber: pageInfo.pageNumber,
      };
      setPoints((prev) => [...prev, newPoint]);
    },
    [findPageFromPoint, points, finishPolygon, isNearStartPoint]
  );

  // Handle mouse move for preview
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (points.length === 0) return;

      const pageInfo = findPageFromPoint(clientX, clientY);
      if (!pageInfo || pageInfo.pageNumber !== points[0].pageNumber) {
        setCurrentPoint(null);
        return;
      }

      setCurrentPoint({
        x: clientX - pageInfo.rect.left,
        y: clientY - pageInfo.rect.top,
        pageNumber: pageInfo.pageNumber,
      });
    },
    [findPageFromPoint, points]
  );

  // Mouse event handlers
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleClick(e.clientX, e.clientY);
    },
    [handleClick]
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        handleClick(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleClick]
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleMove]
  );

  // Handle keyboard events
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setPoints([]);
        setCurrentPoint(null);
        onCancel();
      } else if (e.code === "Enter" && points.length >= 3) {
        finishPolygon();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onCancel, points, finishPolygon]);

  // Render polygon preview
  const renderPolygonPreview = () => {
    if (points.length === 0 || !pageRect) return null;

    const allPoints = currentPoint ? [...points, currentPoint] : points;
    const nearStart =
      currentPoint && isNearStartPoint(currentPoint.x, currentPoint.y);

    const svgStyle: React.CSSProperties = {
      position: "fixed",
      left: pageRect.left,
      top: pageRect.top,
      width: pageRect.width,
      height: pageRect.height,
      pointerEvents: "none",
      zIndex: 1001,
    };

    return (
      <svg style={svgStyle}>
        {/* Draw filled polygon preview */}
        {allPoints.length >= 3 && (
          <polygon
            fill={actualFillColor}
            fillOpacity={fillOpacity}
            points={allPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}
        {/* Draw line segments if less than 3 points */}
        {allPoints.length >= 2 && allPoints.length < 3 && (
          <polyline
            fill="none"
            points={allPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}
        {/* Draw points */}
        {points.map((p, i) => (
          <circle
            cx={p.x}
            cy={p.y}
            fill={i === 0 && nearStart ? "#ffffff" : strokeColor}
            key={i}
            r={i === 0 ? 6 : 4}
            stroke={i === 0 ? strokeColor : "white"}
            strokeWidth={i === 0 ? 2 : 1}
          />
        ))}
      </svg>
    );
  };

  if (!isActive) return null;

  return (
    <>
      <div
        className="PolygonCanvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
      />
      {renderPolygonPreview()}
      <div className="PolygonCanvas__controls">
        <div className="PolygonCanvas__hint">
          Click to add points ({points.length} placed). Click near start point
          or press Enter to close. Escape to cancel.
        </div>
        <button
          className="PolygonCanvas__cancelButton"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </>
  );
};
