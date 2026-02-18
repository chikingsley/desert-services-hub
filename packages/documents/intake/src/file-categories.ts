const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "tiff",
  "tif",
  "webp",
  "heic",
]);
const TEXT_EXTS = new Set(["txt", "csv", "md"]);
const PDF_EXTS = new Set(["pdf"]);
const OFFICE_EXTS = new Set([
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "odt",
  "ods",
  "odp",
  "rtf",
]);
const ZIP_EXTS = new Set(["zip"]);

export type FileCategory =
  | "pdf"
  | "image"
  | "text"
  | "office"
  | "zip"
  | "other";

export function getFileCategory(filePath: string): FileCategory {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  if (PDF_EXTS.has(ext)) {
    return "pdf";
  }
  if (IMAGE_EXTS.has(ext)) {
    return "image";
  }
  if (OFFICE_EXTS.has(ext)) {
    return "office";
  }
  if (TEXT_EXTS.has(ext)) {
    return "text";
  }
  if (ZIP_EXTS.has(ext)) {
    return "zip";
  }
  return "other";
}
