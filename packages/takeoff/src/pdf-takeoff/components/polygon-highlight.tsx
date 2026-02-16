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
 * The props type for {@link PolygonHighlight}.
 *
 * @category Component Properties
 */
export interface PolygonHighlightProps {
  /**
   * Points of the polygon in viewport coordinates.
   */
  points: ViewportPoint[];

  /**
   * Bounding rect for positioning.
   */
  boundingRect: LTWHP;

  /**
   * Stroke color of the polygon.
   */
  color: string;

  /**
   * Stroke width of the polygon.
   * @default 2
   */
  strokeWidth?: number;

  /**
   * Fill opacity.
   * @default 0.2
   */
  fillOpacity?: number;

  /**
   * Label text to display.
   */
  label?: string;

  /**
   * Whether this polygon is currently selected.
   */
  isSelected?: boolean;

  /**
   * Has the polygon been auto-scrolled into view?
   */
  isScrolledTo?: boolean;

  /**
   * Calculated area to display.
   */
  area?: string;

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
 * Renders a polygon annotation for area measurements.
 *
 * @category Component
 */
export const PolygonHighlight = ({
  points,
  boundingRect,
  color,
  strokeWidth = 2,
  fillOpacity = 0.2,
  label: _label,
  isSelected,
  isScrolledTo,
  area,
  onClick,
  onContextMenu,
  style,
}: PolygonHighlightProps) => {
  if (points.length < 3) {
    return null;
  }

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

  // Calculate centroid for label placement
  const centroidX =
    relativePoints.reduce((sum, p) => sum + p.x, 0) / relativePoints.length;
  const centroidY =
    relativePoints.reduce((sum, p) => sum + p.y, 0) / relativePoints.length;

  return (
    <div
      className={`PolygonHighlight ${isSelected ? "PolygonHighlight--selected" : ""} ${isScrolledTo ? "PolygonHighlight--scrolledTo" : ""}`}
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
          <polygon
            fill="none"
            points={relativePoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={color}
            strokeDasharray="6 3"
            strokeOpacity={0.5}
            strokeWidth={strokeWidth + 4}
          />
        )}
        {/* Main polygon with fill */}
        <polygon
          fill={color}
          fillOpacity={fillOpacity}
          points={relativePoints.map((p) => `${p.x},${p.y}`).join(" ")}
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          style={{ pointerEvents: "all", cursor: "pointer" }}
        />
        {/* Points */}
        {relativePoints.map((p) => (
          <circle
            cx={p.x}
            cy={p.y}
            fill={color}
            key={`${p.x}-${p.y}`}
            r={4}
            stroke="white"
            strokeWidth={1}
            style={{ pointerEvents: "all", cursor: "pointer" }}
          />
        ))}
        {/* Area label at centroid */}
        {area && (
          <g>
            <rect
              fill="white"
              height={18}
              rx={3}
              stroke={color}
              strokeWidth={1}
              width={area.length * 8 + 12}
              x={centroidX - (area.length * 8 + 12) / 2}
              y={centroidY - 9}
            />
            <text
              dominantBaseline="central"
              fill={color}
              fontSize={12}
              fontWeight="bold"
              textAnchor="middle"
              x={centroidX}
              y={centroidY}
            >
              {area}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
