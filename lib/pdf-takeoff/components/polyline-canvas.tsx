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
 * The props type for {@link PolylineCanvas}.
 *
 * @category Component Properties
 */
export interface PolylineCanvasProps {
  /**
   * Whether polyline mode is active.
   */
  isActive: boolean;

  /**
   * Stroke color for the polyline.
   * @default "#ef4444"
   */
  strokeColor?: string;

  /**
   * Stroke width for the polyline.
   * @default 3
   */
  strokeWidth?: number;

  /**
   * The PDF viewer instance.
   */
  viewer: InstanceType<typeof TPDFViewer>;

  /**
   * Callback when polyline is complete.
   *
   * @param points - Array of scaled points forming the polyline.
   */
  onComplete: (points: Scaled[]) => void;

  /**
   * Callback when polyline creation is cancelled.
   */
  onCancel: () => void;
}

interface Point {
  x: number;
  y: number;
  pageNumber: number;
}

/**
 * A transparent overlay for creating polyline annotations on PDF pages.
 * Click to add points, double-click to finish.
 *
 * @category Component
 */
export const PolylineCanvas = ({
  isActive,
  strokeColor = "#ef4444",
  strokeWidth = 3,
  viewer,
  onComplete,
  onCancel,
}: PolylineCanvasProps) => {
  const [points, setPoints] = useState<Point[]>([]);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [pageRect, setPageRect] = useState<DOMRect | null>(null);
  const lastClickTimeRef = useRef<number>(0);

  // Find which page the user is interacting with
  const findPageFromPoint = useCallback(
    (clientX: number, clientY: number) => {
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

  // Finish the polyline
  const finishPolyline = useCallback(() => {
    if (points.length < 2 || !viewer) {
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

  // Handle click to add point or finish on double-click
  const handleClick = useCallback(
    (clientX: number, clientY: number) => {
      const now = Date.now();
      const isDoubleClick = now - lastClickTimeRef.current < 300;
      lastClickTimeRef.current = now;

      if (isDoubleClick && points.length >= 2) {
        finishPolyline();
        return;
      }

      const pageInfo = findPageFromPoint(clientX, clientY);
      if (!pageInfo) {
        return;
      }

      // If we have points on a different page, don't allow cross-page polylines
      if (points.length > 0 && points[0].pageNumber !== pageInfo.pageNumber) {
        return;
      }

      setPageRect(pageInfo.rect);
      const newPoint: Point = {
        x: clientX - pageInfo.rect.left,
        y: clientY - pageInfo.rect.top,
        pageNumber: pageInfo.pageNumber,
      };
      setPoints((prev) => [...prev, newPoint]);
    },
    [findPageFromPoint, points, finishPolyline]
  );

  // Handle mouse move for preview
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (points.length === 0) {
        return;
      }

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
    if (!isActive) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setPoints([]);
        setCurrentPoint(null);
        onCancel();
      } else if (e.code === "Enter" && points.length >= 2) {
        finishPolyline();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onCancel, points, finishPolyline]);

  // Render polyline preview
  const renderPolylinePreview = () => {
    if (points.length === 0 || !pageRect) {
      return null;
    }

    const allPoints = currentPoint ? [...points, currentPoint] : points;

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
        {/* Draw line segments */}
        {allPoints.length >= 2 && (
          <polyline
            fill="none"
            points={allPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={strokeColor}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        )}
        {/* Draw points */}
        {points.map((p) => (
          <circle
            cx={p.x}
            cy={p.y}
            fill={strokeColor}
            key={`${p.x}-${p.y}`}
            r={4}
            stroke="white"
            strokeWidth={1}
          />
        ))}
      </svg>
    );
  };

  if (!isActive) {
    return null;
  }

  return (
    <>
      <div
        className="PolylineCanvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
      />
      {renderPolylinePreview()}
      <div className="PolylineCanvas__controls">
        <div className="PolylineCanvas__hint">
          Click to add points ({points.length} placed). Double-click or press
          Enter to finish. Escape to cancel.
        </div>
        <button
          className="PolylineCanvas__cancelButton"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </>
  );
};
