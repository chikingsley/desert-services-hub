import type { CSSProperties, MouseEvent } from "react";
import type { LTWHP } from "../types";

/**
 * The props type for {@link CountMarkerHighlight}.
 *
 * @category Component Properties
 */
export interface CountMarkerHighlightProps {
  /**
   * Position of the marker in viewport coordinates.
   */
  position: LTWHP;

  /**
   * Color of the marker.
   */
  color: string;

  /**
   * Label text to display in the marker.
   */
  label?: string;

  /**
   * Sequential number for this marker type.
   */
  number?: number;

  /**
   * Whether this marker is currently selected.
   */
  isSelected?: boolean;

  /**
   * Has the marker been auto-scrolled into view?
   */
  isScrolledTo?: boolean;

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
 * Renders a count marker annotation as a circular marker.
 *
 * @category Component
 */
export const CountMarkerHighlight = ({
  position,
  color,
  label: _label,
  number,
  isSelected,
  isScrolledTo,
  onClick,
  onContextMenu,
  style,
}: CountMarkerHighlightProps) => {
  const size = Math.max(position.width, position.height, 24);

  return (
    <div
      className={`CountMarkerHighlight ${isSelected ? "CountMarkerHighlight--selected" : ""} ${isScrolledTo ? "CountMarkerHighlight--scrolledTo" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }}
      role="button"
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        cursor: "pointer",
        ...style,
      }}
      tabIndex={0}
    >
      <svg
        aria-hidden="true"
        height={size}
        style={{ overflow: "visible" }}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        {/* Outer ring for selection */}
        {isSelected && (
          <circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={size / 2 + 2}
            stroke={color}
            strokeDasharray="4 2"
            strokeWidth={2}
          />
        )}
        {/* Main marker circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          fill={color}
          r={size / 2 - 2}
          stroke="white"
          strokeWidth={2}
        />
        {/* Number label */}
        {number !== undefined && (
          <text
            dominantBaseline="central"
            fill="white"
            fontSize={size * 0.5}
            fontWeight="bold"
            style={{ userSelect: "none" }}
            textAnchor="middle"
            x={size / 2}
            y={size / 2}
          >
            {number}
          </text>
        )}
      </svg>
    </div>
  );
};
