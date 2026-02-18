import { describe, expect, test } from "bun:test";
import { getFileCategory } from "@documents-intake/file-categories";

describe("getFileCategory", () => {
  test("classifies office extensions", () => {
    expect(getFileCategory("foo.docx")).toBe("office");
    expect(getFileCategory("foo.XLSX")).toBe("office");
    expect(getFileCategory("foo.ppt")).toBe("office");
  });

  test("classifies zip/image/pdf/text", () => {
    expect(getFileCategory("foo.zip")).toBe("zip");
    expect(getFileCategory("foo.png")).toBe("image");
    expect(getFileCategory("foo.pdf")).toBe("pdf");
    expect(getFileCategory("foo.md")).toBe("text");
  });

  test("defaults to other", () => {
    expect(getFileCategory("foo.unknown")).toBe("other");
    expect(getFileCategory("foo")).toBe("other");
  });
});
