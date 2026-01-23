import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { startWatcher, stopWatcher } from "./watcher";

describe("contract pipeline watcher", () => {
  let testDir: string;
  let processedFiles: string[];

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = await mkdtemp(path.join(tmpdir(), "watcher-test-"));
    processedFiles = [];

    // Set watch directory via env
    process.env.CONTRACT_WATCH_DIR = testDir;

    // Clean up test entries from previous runs
    db.run("DELETE FROM processed_contracts WHERE filename LIKE 'test-%'");
  });

  afterEach(async () => {
    await stopWatcher();
    await rm(testDir, { recursive: true, force: true });
    process.env.CONTRACT_WATCH_DIR = undefined;
  });

  it("detects new PDF files", async () => {
    const handler = (filePath: string) => {
      processedFiles.push(filePath);
      return Promise.resolve();
    };

    startWatcher(handler);

    // Wait for watcher to be ready
    await Bun.sleep(500);

    // Create a PDF file
    const pdfPath = path.join(testDir, "test-new.pdf");
    await writeFile(pdfPath, "fake pdf content");

    // Wait for detection (awaitWriteFinish + processing)
    await Bun.sleep(3000);

    expect(processedFiles.length).toBe(1);
    expect(processedFiles[0]).toContain("test-new.pdf");
  });

  it("ignores non-PDF files", async () => {
    const handler = (filePath: string) => {
      processedFiles.push(filePath);
      return Promise.resolve();
    };

    startWatcher(handler);
    await Bun.sleep(500);

    // Create non-PDF files
    await writeFile(path.join(testDir, "test-ignore.txt"), "text content");
    await writeFile(path.join(testDir, "test-ignore.docx"), "docx content");

    await Bun.sleep(3000);

    expect(processedFiles.length).toBe(0);
  });

  it("does not process duplicate filenames", async () => {
    const handler = (filePath: string) => {
      processedFiles.push(filePath);
      return Promise.resolve();
    };

    startWatcher(handler);
    await Bun.sleep(500);

    // Create first PDF
    const pdfPath = path.join(testDir, "test-dedup.pdf");
    await writeFile(pdfPath, "first content");
    await Bun.sleep(3000);

    // Delete and recreate same filename
    await rm(pdfPath);
    await writeFile(pdfPath, "second content");
    await Bun.sleep(3000);

    // Should only process once
    expect(processedFiles.length).toBe(1);
  });

  it("stops cleanly without errors", async () => {
    const handler = (_filePath: string) => {
      return Promise.resolve();
    };

    startWatcher(handler);
    await Bun.sleep(500);

    // Should not throw
    await expect(stopWatcher()).resolves.toBeUndefined();
  });
});
