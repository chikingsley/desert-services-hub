import type { CSSProperties, MouseEvent } from "react";
import type { LTWHP } from "../types";

/**
 * A point in viewport coordinates.
 */
export interface ViewportPoint {
  x: number;
  y: number;
}

/**
 * The props type for {@link PolylineHighlight}.
 *
 * @category Component Properties
 */
export interface PolylineHighlightProps {
  /**
   * Points of the polyline in viewport coordinates.
   */
  points: ViewportPoint[];

  /**
   * Bounding rect for positioning.
   */
  boundingRect: LTWHP;

  /**
   * Stroke color of the polyline.
   */
  color: string;

  /**
   * Stroke width of the polyline.
   * @default 3
   */
  strokeWidth?: number;

  /**
   * Label text to display.
   */
  label?: string;

  /**
   * Whether this polyline is currently selected.
   */
  isSelected?: boolean;

  /**
   * Has the polyline been auto-scrolled into view?
   */
  isScrolledTo?: boolean;

  /**
   * Calculated length to display.
   */
  length?: string;

  /**
   * Callback triggered on click.
   */
  onClick?(event: MouseEvent<HTMLDivElement>): void;

  /**
   * Callback triggered on context menu.
   */
  onContextMenu?(event: MouseEvent<HTMLDivElement>): void;

  /**
   * Custom styling for the container.
   */
  style?: CSSProperties;
}

/**
 * Renders a polyline annotation.
 *
 * @category Component
 */
export const PolylineHighlight = ({
  points,
  boundingRect,
  color,
  strokeWidth = 3,
  label,
  isSelected,
  isScrolledTo,
  length,
  onClick,
  onContextMenu,
  style,
}: PolylineHighlightProps) => {
  if (points.length < 2) return null;

  // Calculate min x,y to offset points relative to bounding rect
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));

  // Offset points to be relative to the container
  const relativePoints = points.map((p) => ({
    x: p.x - minX + strokeWidth,
    y: p.y - minY + strokeWidth,
  }));

  const width = boundingRect.width + strokeWidth * 2;
  const height = boundingRect.height + strokeWidth * 2;

  // Find midpoint for label
  const midIndex = Math.floor(points.length / 2);
  const labelX = relativePoints[midIndex]?.x ?? 0;
  const labelY = relativePoints[midIndex]?.y ?? 0;

  return (
    <div
      className={`PolylineHighlight ${isSelected ? "PolylineHighlight--selected" : ""} ${isScrolledTo ? "PolylineHighlight--scrolledTo" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        left: boundingRect.left - strokeWidth,
        top: boundingRect.top - strokeWidth,
        width,
        height,
        pointerEvents: "none",
        ...style,
      }}
    >
      <svg
        height={height}
        style={{ overflow: "visible" }}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        {/* Selection highlight */}
        {isSelected && (
          <polyline
            fill="none"
            points={relativePoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={color}
            strokeDasharray="6 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.5}
            strokeWidth={strokeWidth + 4}
          />
        )}
        {/* Main polyline */}
        <polyline
          fill="none"
          points={relativePoints.map((p) => `${p.x},${p.y}`).join(" ")}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
        />
        {/* Points */}
        {relativePoints.map((p, i) => (
          <circle
            cx={p.x}
            cy={p.y}
            fill={color}
            key={i}
            r={4}
            stroke="white"
            strokeWidth={1}
            style={{ pointerEvents: "all", cursor: "pointer" }}
          />
        ))}
        {/* Length label */}
        {length && (
          <g>
            <rect
              fill="white"
              height={18}
              rx={3}
              stroke={color}
              strokeWidth={1}
              width={length.length * 8 + 12}
              x={labelX - (length.length * 8 + 12) / 2}
              y={labelY - 24}
            />
            <text
              dominantBaseline="central"
              fill={color}
              fontSize={12}
              fontWeight="bold"
              textAnchor="middle"
              x={labelX}
              y={labelY - 15}
            >
              {length}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
