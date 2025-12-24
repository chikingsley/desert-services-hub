import type { PDFViewer as TPDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import {
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { viewportPositionToScaled } from "../lib/coordinates";
import type { ScaledPosition, ViewportPosition } from "../types";

/**
 * The props type for {@link CountCanvas}.
 *
 * @category Component Properties
 */
export interface CountCanvasProps {
  /**
   * Whether count mode is active.
   */
  isActive: boolean;

  /**
   * Color for the count marker.
   * @default "#22c55e"
   */
  color?: string;

  /**
   * Size of the count marker.
   * @default 24
   */
  markerSize?: number;

  /**
   * The PDF viewer instance.
   */
  viewer: InstanceType<typeof TPDFViewer>;

  /**
   * Callback when a count marker is placed.
   *
   * @param position - Scaled position of the marker on the page.
   */
  onPlace: (position: ScaledPosition) => void;

  /**
   * Callback when count mode is cancelled.
   */
  onCancel: () => void;
}

/**
 * A transparent overlay for placing count markers on PDF pages.
 * Single click to place a marker.
 *
 * @category Component
 */
export const CountCanvas = ({
  isActive,
  color = "#22c55e",
  markerSize = 24,
  viewer,
  onPlace,
  onCancel,
}: CountCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Find which page the user clicked on
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

  // Handle click to place marker
  const handleClick = useCallback(
    (clientX: number, clientY: number) => {
      const pageInfo = findPageFromPoint(clientX, clientY);
      if (!(pageInfo && viewer)) return;

      const clickX = clientX - pageInfo.rect.left;
      const clickY = clientY - pageInfo.rect.top;

      // Create viewport position centered on click
      const viewportPosition: ViewportPosition = {
        boundingRect: {
          left: clickX - markerSize / 2,
          top: clickY - markerSize / 2,
          width: markerSize,
          height: markerSize,
          pageNumber: pageInfo.pageNumber,
        },
        rects: [],
      };

      const scaledPosition = viewportPositionToScaled(viewportPosition, viewer);
      onPlace(scaledPosition);
    },
    [findPageFromPoint, viewer, markerSize, onPlace]
  );

  // Mouse event handler
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleClick(e.clientX, e.clientY);
    },
    [handleClick]
  );

  // Touch event handler
  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        handleClick(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    [handleClick]
  );

  // Handle keyboard events
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onCancel]);

  if (!isActive) return null;

  return (
    <>
      <div
        className="CountCanvas"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        ref={containerRef}
      />
      <div className="CountCanvas__controls">
        <div className="CountCanvas__hint">
          Click to place a marker. Press Escape to cancel.
        </div>
        <button
          className="CountCanvas__cancelButton"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </>
  );
};
