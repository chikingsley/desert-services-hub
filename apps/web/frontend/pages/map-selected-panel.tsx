import type { LowestPoint, ParcelInfo } from "./map-helpers";
import { metersToFeet } from "./map-helpers";

interface MapSelectedPanelProps {
  selected: ParcelInfo;
  lowestPoint: LowestPoint | null;
  findingLowestPoint: boolean;
  onClear: () => void;
}

export function MapSelectedPanel({
  selected,
  lowestPoint,
  findingLowestPoint,
  onClear,
}: MapSelectedPanelProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 12,
        zIndex: 10,
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: "12px 16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        fontSize: 13,
        lineHeight: 1.6,
        minWidth: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
        }}
      >
        <strong style={{ fontSize: 14 }}>Parcel</strong>
        <button
          onClick={onClear}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            color: "#999",
            padding: "0 2px",
            lineHeight: 1,
          }}
          type="button"
        >
          &times;
        </button>
      </div>
      <div style={{ marginTop: 4 }}>
        <div>
          <b>APN:</b> {selected.apn}
        </div>
        {selected.address && (
          <div>
            <b>Address:</b> {selected.address}
          </div>
        )}
        {selected.owner && (
          <div>
            <b>Owner:</b> {selected.owner}
          </div>
        )}
        {selected.acres != null && (
          <div>
            <b>Size:</b> {selected.acres.toLocaleString()} sq ft
          </div>
        )}
        {findingLowestPoint && <div>Finding low point...</div>}
        {!findingLowestPoint && lowestPoint && (
          <div>
            <b>{lowestPoint.approximate ? "Approx Low" : "Low Point"}:</b>{" "}
            {metersToFeet(lowestPoint.elevationMeters).toFixed(1)} ft
          </div>
        )}
      </div>
    </div>
  );
}
