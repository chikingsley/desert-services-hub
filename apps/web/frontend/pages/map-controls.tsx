interface MapControlsProps {
  isSatellite: boolean;
  onSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onToggleSatellite: () => void;
  searching: boolean;
  searchQuery: string;
}

export function MapControls({
  isSatellite,
  searchQuery,
  searching,
  onToggleSatellite,
  onSearchQueryChange,
  onSearch,
}: MapControlsProps) {
  return (
    <>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}>
        <button
          onClick={onToggleSatellite}
          style={{
            padding: "6px 14px",
            background: isSatellite ? "#1565c0" : "rgba(255,255,255,0.92)",
            color: isSatellite ? "#fff" : "#333",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}
          type="button"
        >
          {isSatellite ? "Streets" : "Satellite"}
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          gap: 6,
        }}
      >
        <input
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSearch();
            }
          }}
          placeholder="Search APN..."
          style={{
            width: 220,
            padding: "7px 12px",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            outline: "none",
          }}
          type="text"
          value={searchQuery}
        />
        <button
          disabled={searching}
          onClick={onSearch}
          style={{
            padding: "7px 14px",
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            opacity: searching ? 0.5 : 1,
          }}
          type="button"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>
    </>
  );
}
