import { sanitizeName } from "@lib/sharepoint/paths";

export const TAKEOFFS_ROOT_FOLDER = "Takeoffs";
export const SHAREPOINT_PDF_URL_PREFIX = "sharepoint://";
export const LEGACY_MINIO_URL_PREFIX = "minio://";

const LEGACY_MINIO_BUCKET_PREFIX = "takeoffs/";
const TAKEOFF_ID_SANITIZE_RE = /[^a-zA-Z0-9_-]/g;
const LEADING_SLASHES_RE = /^\/+/;
const EXTERNAL_URL_RE = /^https?:\/\//i;

export function sanitizeTakeoffIdForPath(takeoffId: string): string {
  const trimmed = takeoffId.trim();
  if (!trimmed) {
    return "unknown";
  }
  return trimmed.replace(TAKEOFF_ID_SANITIZE_RE, "_");
}

export function normalizeTakeoffPdfFileName(
  fileName: string | null | undefined
): string {
  const trimmed = fileName?.trim();
  const safe = sanitizeName(
    trimmed && trimmed.length > 0 ? trimmed : "original.pdf"
  );

  if (!safe) {
    return "original.pdf";
  }

  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

export function buildTakeoffSharePointPath(
  takeoffId: string,
  fileName: string
): string {
  const safeTakeoffId = sanitizeTakeoffIdForPath(takeoffId);
  const safeFileName = normalizeTakeoffPdfFileName(fileName);
  return `${TAKEOFFS_ROOT_FOLDER}/${safeTakeoffId}/${safeFileName}`;
}

export function encodeSharePointPdfUrl(path: string): string {
  return `${SHAREPOINT_PDF_URL_PREFIX}${encodeURIComponent(path)}`;
}

export function decodeSharePointPdfPath(
  pdfUrl: string | null | undefined
): string | null {
  if (!pdfUrl) {
    return null;
  }

  if (pdfUrl.startsWith(SHAREPOINT_PDF_URL_PREFIX)) {
    const encoded = pdfUrl.slice(SHAREPOINT_PDF_URL_PREFIX.length).trim();
    if (!encoded) {
      return null;
    }

    try {
      const decoded = decodeURIComponent(encoded);
      return decoded.length > 0 ? decoded : null;
    } catch {
      return null;
    }
  }

  if (pdfUrl.startsWith(LEGACY_MINIO_URL_PREFIX)) {
    const rawKey = pdfUrl
      .slice(LEGACY_MINIO_URL_PREFIX.length)
      .replace(LEADING_SLASHES_RE, "");

    if (!rawKey) {
      return null;
    }

    let decodedKey = rawKey;
    try {
      decodedKey = decodeURIComponent(rawKey);
    } catch {
      // Keep raw key if it is not URL-encoded.
    }

    if (decodedKey.toLowerCase().startsWith(LEGACY_MINIO_BUCKET_PREFIX)) {
      const suffix = decodedKey.slice(LEGACY_MINIO_BUCKET_PREFIX.length);
      return `${TAKEOFFS_ROOT_FOLDER}/${suffix}`;
    }

    return `${TAKEOFFS_ROOT_FOLDER}/${decodedKey}`;
  }

  return null;
}

export function isExternalPdfUrl(pdfUrl: string | null | undefined): boolean {
  return Boolean(pdfUrl && EXTERNAL_URL_RE.test(pdfUrl));
}
