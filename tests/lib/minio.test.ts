import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  BUCKETS,
  deleteFile,
  deleteTakeoffFiles,
  fileExists,
  getFile,
  getFileStats,
  getFileTags,
  getPresignedUrl,
  getTakeoffPdf,
  getTakeoffPdfUrl,
  initializeBuckets,
  minioClient,
  setFileTags,
  uploadFile,
  uploadTakeoffPdf,
} from "@/lib/minio";

// Test constants
const TEST_TAKEOFF_ID = `test-takeoff-${Date.now()}`;
const TEST_PDF_CONTENT = Buffer.from("%PDF-1.4 test content");
const TEST_FILENAME = "test.pdf";

describe("MinIO/AIStor Storage", () => {
  // Connection test - runs first to verify AIStor is available
  describe("Connection", () => {
    test("should connect to AIStor", async () => {
      // listBuckets will fail if not connected
      const buckets = await minioClient.listBuckets();
      expect(Array.isArray(buckets)).toBe(true);
    });
  });

  describe("Bucket Initialization", () => {
    test("should initialize all required buckets", async () => {
      await initializeBuckets();

      // Verify each bucket exists
      const takeoffsExists = await minioClient.bucketExists(BUCKETS.TAKEOFFS);
      const quotesExists = await minioClient.bucketExists(BUCKETS.QUOTES);
      const thumbnailsExists = await minioClient.bucketExists(
        BUCKETS.THUMBNAILS
      );

      expect(takeoffsExists).toBe(true);
      expect(quotesExists).toBe(true);
      expect(thumbnailsExists).toBe(true);
    });

    test("should be idempotent (safe to call multiple times)", async () => {
      // Should not throw when buckets already exist
      await initializeBuckets();
      await initializeBuckets();

      const exists = await minioClient.bucketExists(BUCKETS.TAKEOFFS);
      expect(exists).toBe(true);
    });
  });

  describe("File Upload", () => {
    test("should upload a file and return minio:// URL", async () => {
      const url = await uploadFile(
        BUCKETS.TAKEOFFS,
        `${TEST_TAKEOFF_ID}/generic.pdf`,
        TEST_PDF_CONTENT,
        "application/pdf"
      );

      expect(url).toStartWith("minio://");
      expect(url).toContain(BUCKETS.TAKEOFFS);
      expect(url).toContain(TEST_TAKEOFF_ID);
    });

    test("should upload takeoff PDF with correct structure", async () => {
      const result = await uploadTakeoffPdf(
        TEST_TAKEOFF_ID,
        TEST_PDF_CONTENT,
        TEST_FILENAME
      );

      expect(result.url).toBe(
        `minio://${BUCKETS.TAKEOFFS}/${TEST_TAKEOFF_ID}/${TEST_FILENAME}`
      );
      expect(result.size).toBe(TEST_PDF_CONTENT.length);
    });
  });

  describe("File Retrieval", () => {
    beforeAll(async () => {
      // Ensure test file exists
      await uploadTakeoffPdf(TEST_TAKEOFF_ID, TEST_PDF_CONTENT, "original.pdf");
    });

    test("should retrieve file content as buffer", async () => {
      const buffer = await getFile(
        BUCKETS.TAKEOFFS,
        `${TEST_TAKEOFF_ID}/original.pdf`
      );

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe(TEST_PDF_CONTENT.toString());
    });

    test("should retrieve takeoff PDF by ID", async () => {
      const buffer = await getTakeoffPdf(TEST_TAKEOFF_ID, "original.pdf");

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString()).toBe(TEST_PDF_CONTENT.toString());
    });

    test("should get file stats", async () => {
      const stats = await getFileStats(
        BUCKETS.TAKEOFFS,
        `${TEST_TAKEOFF_ID}/original.pdf`
      );

      expect(stats.size).toBe(TEST_PDF_CONTENT.length);
      expect(stats.metaData).toBeDefined();
    });
  });

  describe("Presigned URLs", () => {
    test("should generate presigned URL", async () => {
      // Upload fresh for this test
      await uploadTakeoffPdf(TEST_TAKEOFF_ID, TEST_PDF_CONTENT, "presigned-test.pdf");

      const url = await getPresignedUrl(
        BUCKETS.TAKEOFFS,
        `${TEST_TAKEOFF_ID}/presigned-test.pdf`,
        3600
      );

      expect(url).toContain("http");
      expect(url).toContain(BUCKETS.TAKEOFFS);
      expect(url).toContain(TEST_TAKEOFF_ID);
      // Presigned URLs contain signature params
      expect(url).toContain("X-Amz-Signature");
    });

    test("should generate takeoff PDF URL", async () => {
      await uploadTakeoffPdf(TEST_TAKEOFF_ID, TEST_PDF_CONTENT, "url-test.pdf");
      const url = await getTakeoffPdfUrl(TEST_TAKEOFF_ID, "url-test.pdf");

      expect(url).toContain("http");
      expect(url).toContain("url-test.pdf");
    });

    test("presigned URL should be fetchable and return correct content", async () => {
      // Upload with unique filename to ensure isolation
      const uniqueFilename = `fetch-test-${Date.now()}.pdf`;
      await uploadTakeoffPdf(TEST_TAKEOFF_ID, TEST_PDF_CONTENT, uniqueFilename);

      // Get presigned URL and fetch
      const url = await getTakeoffPdfUrl(TEST_TAKEOFF_ID, uniqueFilename);
      const response = await fetch(url);

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.toString()).toBe(TEST_PDF_CONTENT.toString());
    });
  });

  describe("File Existence Check", () => {
    test("should return true for existing file", async () => {
      await uploadTakeoffPdf(TEST_TAKEOFF_ID, TEST_PDF_CONTENT, "exists.pdf");

      const exists = await fileExists(
        BUCKETS.TAKEOFFS,
        `${TEST_TAKEOFF_ID}/exists.pdf`
      );

      expect(exists).toBe(true);
    });

    test("should return false for non-existing file", async () => {
      const exists = await fileExists(
        BUCKETS.TAKEOFFS,
        "non-existent-takeoff/file.pdf"
      );

      expect(exists).toBe(false);
    });
  });

  describe("File Tags/Metadata", () => {
    const tagTestFile = `${TEST_TAKEOFF_ID}/tagged.pdf`;

    beforeAll(async () => {
      await uploadFile(
        BUCKETS.TAKEOFFS,
        tagTestFile,
        TEST_PDF_CONTENT,
        "application/pdf"
      );
    });

    test("should set file tags", async () => {
      const tags = {
        takeoff_id: TEST_TAKEOFF_ID,
        original_name: "my-document.pdf",
        upload_time: new Date().toISOString(),
      };

      // Should not throw
      await setFileTags(BUCKETS.TAKEOFFS, tagTestFile, tags);
    });

    test("should retrieve file tags", async () => {
      const tags = {
        takeoff_id: TEST_TAKEOFF_ID,
        test_tag: "test_value",
      };

      await setFileTags(BUCKETS.TAKEOFFS, tagTestFile, tags);

      const retrievedTags = await getFileTags(BUCKETS.TAKEOFFS, tagTestFile);

      expect(retrievedTags.takeoff_id).toBe(TEST_TAKEOFF_ID);
      expect(retrievedTags.test_tag).toBe("test_value");
    });
  });

  describe("File Deletion", () => {
    test("should delete a single file", async () => {
      const deleteTestFile = `${TEST_TAKEOFF_ID}/to-delete.pdf`;
      await uploadFile(BUCKETS.TAKEOFFS, deleteTestFile, TEST_PDF_CONTENT);

      // Verify it exists
      expect(await fileExists(BUCKETS.TAKEOFFS, deleteTestFile)).toBe(true);

      // Delete it
      await deleteFile(BUCKETS.TAKEOFFS, deleteTestFile);

      // Verify it's gone
      expect(await fileExists(BUCKETS.TAKEOFFS, deleteTestFile)).toBe(false);
    });

    test("should delete all files for a takeoff", async () => {
      const cleanupId = `cleanup-test-${Date.now()}`;

      // Upload multiple files
      await uploadTakeoffPdf(cleanupId, TEST_PDF_CONTENT, "file1.pdf");
      await uploadTakeoffPdf(cleanupId, TEST_PDF_CONTENT, "file2.pdf");
      await uploadFile(
        BUCKETS.THUMBNAILS,
        `${cleanupId}/thumb1.png`,
        Buffer.from("fake png"),
        "image/png"
      );

      // Verify they exist
      expect(await fileExists(BUCKETS.TAKEOFFS, `${cleanupId}/file1.pdf`)).toBe(
        true
      );
      expect(await fileExists(BUCKETS.TAKEOFFS, `${cleanupId}/file2.pdf`)).toBe(
        true
      );
      expect(
        await fileExists(BUCKETS.THUMBNAILS, `${cleanupId}/thumb1.png`)
      ).toBe(true);

      // Delete all
      await deleteTakeoffFiles(cleanupId);

      // Verify all gone
      expect(await fileExists(BUCKETS.TAKEOFFS, `${cleanupId}/file1.pdf`)).toBe(
        false
      );
      expect(await fileExists(BUCKETS.TAKEOFFS, `${cleanupId}/file2.pdf`)).toBe(
        false
      );
      expect(
        await fileExists(BUCKETS.THUMBNAILS, `${cleanupId}/thumb1.png`)
      ).toBe(false);
    });
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Clean up test files
    await deleteTakeoffFiles(TEST_TAKEOFF_ID);
  });
});
