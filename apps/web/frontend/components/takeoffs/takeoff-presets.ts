export interface PresetItem {
  id: string;
  label: string;
  color: string;
  type: "count" | "linear" | "area";
}

export interface ScalePreset {
  id: string;
  label: string;
  pixelsPerFoot: number;
}

// Common architectural/engineering scales
export const SCALE_PRESETS: readonly ScalePreset[] = [
  { id: "1_5", label: "1\" = 5'", pixelsPerFoot: 72 / 5 },
  { id: "1_10", label: "1\" = 10'", pixelsPerFoot: 72 / 10 },
  { id: "1_20", label: "1\" = 20'", pixelsPerFoot: 72 / 20 },
  { id: "1_30", label: "1\" = 30'", pixelsPerFoot: 72 / 30 },
  { id: "1_40", label: "1\" = 40'", pixelsPerFoot: 72 / 40 },
  { id: "1_50", label: "1\" = 50'", pixelsPerFoot: 72 / 50 },
  { id: "1_100", label: "1\" = 100'", pixelsPerFoot: 72 / 100 },
  { id: "custom", label: "Custom...", pixelsPerFoot: 0 },
];
