// Simple in-memory store for takeoff files during editing session
// In production, these would be uploaded to Supabase storage

interface TakeoffData {
  file: string; // base64 data URL
  name: string;
}

const store = new Map<string, TakeoffData>();

export function setTakeoffData(id: string, data: TakeoffData) {
  store.set(id, data);
}

export function getTakeoffData(id: string): TakeoffData | undefined {
  return store.get(id);
}

export function clearTakeoffData(id: string) {
  store.delete(id);
}
