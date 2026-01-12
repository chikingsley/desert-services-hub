// Simple in-memory store for takeoff files during editing session
// TODO: In production, files should be uploaded to server storage (S3, Cloudflare R2, etc.)

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
