import { type BucketItemStat, Client } from "minio";

// MinIO client configuration
const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: Number.parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// Bucket names
export const BUCKETS = {
  TAKEOFFS: process.env.MINIO_BUCKET_TAKEOFFS || "takeoffs",
  QUOTES: process.env.MINIO_BUCKET_QUOTES || "quotes",
  THUMBNAILS: process.env.MINIO_BUCKET_THUMBNAILS || "thumbnails",
} as const;

/**
 * Ensure a bucket exists, create if not
 */
export async function ensureBucket(bucketName: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName);
  }
}

/**
 * Initialize all required buckets
 */
export async function initializeBuckets(): Promise<void> {
  await Promise.all([
    ensureBucket(BUCKETS.TAKEOFFS),
    ensureBucket(BUCKETS.QUOTES),
    ensureBucket(BUCKETS.THUMBNAILS),
  ]);
}

/**
 * Upload a file to MinIO
 */
export async function uploadFile(
  bucket: string,
  objectName: string,
  buffer: Buffer,
  contentType = "application/octet-stream"
): Promise<string> {
  await ensureBucket(bucket);

  await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type": contentType,
  });

  return `minio://${bucket}/${objectName}`;
}

/**
 * Upload a PDF file for a takeoff
 */
export async function uploadTakeoffPdf(
  takeoffId: string,
  buffer: Buffer,
  filename: string
): Promise<{ url: string; size: number }> {
  const objectName = `${takeoffId}/${filename}`;
  const url = await uploadFile(
    BUCKETS.TAKEOFFS,
    objectName,
    buffer,
    "application/pdf"
  );

  return { url, size: buffer.length };
}

/**
 * Upload a thumbnail image
 */
export function uploadThumbnail(
  takeoffId: string,
  annotationId: string,
  buffer: Buffer
): Promise<string> {
  const objectName = `${takeoffId}/${annotationId}.png`;
  return uploadFile(BUCKETS.THUMBNAILS, objectName, buffer, "image/png");
}

/**
 * Get a file as a buffer
 */
export async function getFile(
  bucket: string,
  objectName: string
): Promise<Buffer> {
  const stream = await minioClient.getObject(bucket, objectName);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * Get a file stream (for large files)
 */
export function getFileStream(
  bucket: string,
  objectName: string
): Promise<NodeJS.ReadableStream> {
  return minioClient.getObject(bucket, objectName);
}

/**
 * Get a takeoff PDF
 */
export function getTakeoffPdf(
  takeoffId: string,
  filename = "original.pdf"
): Promise<Buffer> {
  return getFile(BUCKETS.TAKEOFFS, `${takeoffId}/${filename}`);
}

/**
 * Generate a presigned URL for direct browser access
 * @param expiry - URL expiry time in seconds (default 1 hour)
 */
export function getPresignedUrl(
  bucket: string,
  objectName: string,
  expiry = 3600
): Promise<string> {
  return minioClient.presignedGetObject(bucket, objectName, expiry);
}

/**
 * Get a presigned URL for a takeoff PDF
 */
export function getTakeoffPdfUrl(
  takeoffId: string,
  filename = "original.pdf",
  expiry = 3600
): Promise<string> {
  return getPresignedUrl(BUCKETS.TAKEOFFS, `${takeoffId}/${filename}`, expiry);
}

/**
 * Delete a file
 */
export async function deleteFile(
  bucket: string,
  objectName: string
): Promise<void> {
  await minioClient.removeObject(bucket, objectName);
}

/**
 * Collect all object names from a bucket prefix
 */
async function collectObjectNames(
  bucket: string,
  prefix: string
): Promise<string[]> {
  const stream = minioClient.listObjects(bucket, prefix, true);
  const names: string[] = [];
  for await (const obj of stream) {
    if (obj.name) {
      names.push(obj.name);
    }
  }
  return names;
}

/**
 * Delete all files for a takeoff (including thumbnails)
 */
export async function deleteTakeoffFiles(takeoffId: string): Promise<void> {
  const prefix = `${takeoffId}/`;

  const [takeoffObjects, thumbnailObjects] = await Promise.all([
    collectObjectNames(BUCKETS.TAKEOFFS, prefix),
    collectObjectNames(BUCKETS.THUMBNAILS, prefix),
  ]);

  const deletions: Promise<unknown>[] = [];

  if (takeoffObjects.length > 0) {
    deletions.push(minioClient.removeObjects(BUCKETS.TAKEOFFS, takeoffObjects));
  }
  if (thumbnailObjects.length > 0) {
    deletions.push(
      minioClient.removeObjects(BUCKETS.THUMBNAILS, thumbnailObjects)
    );
  }

  await Promise.all(deletions);
}

/**
 * Get file info/stats
 */
export function getFileStats(
  bucket: string,
  objectName: string
): Promise<BucketItemStat> {
  return minioClient.statObject(bucket, objectName);
}

/**
 * Check if a file exists
 */
export async function fileExists(
  bucket: string,
  objectName: string
): Promise<boolean> {
  try {
    await minioClient.statObject(bucket, objectName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Set object tags (for metadata)
 */
export async function setFileTags(
  bucket: string,
  objectName: string,
  tags: Record<string, string>
): Promise<void> {
  await minioClient.setObjectTagging(bucket, objectName, tags);
}

/**
 * Get object tags
 */
export async function getFileTags(
  bucket: string,
  objectName: string
): Promise<Record<string, string>> {
  const tags = await minioClient.getObjectTagging(bucket, objectName);
  return Object.fromEntries(tags.map((tag) => [tag.Key, tag.Value]));
}

// Export the raw client for advanced usage
export { minioClient };
