// Type declarations for pdfmake 0.3.x Node.js API

declare module "pdfmake" {
  import type { TDocumentDefinitions } from "pdfmake/interfaces";

  interface VirtualFileSystem {
    writeFileSync(name: string, data: Buffer): void;
    readFileSync(name: string): Buffer;
    existsSync(name: string): boolean;
  }

  interface FontDefinition {
    normal: string;
    bold: string;
    italics: string;
    bolditalics: string;
  }

  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
    getBase64(): Promise<string>;
    getDataUrl(): Promise<string>;
    getStream(): Promise<NodeJS.ReadableStream>;
    write(filename: string): Promise<void>;
  }

  interface PdfMake {
    virtualfs: VirtualFileSystem;
    setFonts(fonts: Record<string, FontDefinition>): void;
    addFonts(fonts: Record<string, FontDefinition>): void;
    clearFonts(): void;
    createPdf(
      docDefinition: TDocumentDefinitions,
      options?: Record<string, unknown>
    ): OutputDocument;
  }

  const pdfmake: PdfMake;
  export default pdfmake;
}

declare module "pdfmake/build/vfs_fonts" {
  // In 0.3.x, vfs_fonts exports fonts directly as Record<string, string>
  const vfsFonts: Record<string, string>;
  export default vfsFonts;
}

// Browser build type declarations
declare module "pdfmake/build/pdfmake" {
  import type { TDocumentDefinitions } from "pdfmake/interfaces";

  interface BrowserOutputDocument {
    getBlob(callback: (blob: Blob) => void): void;
    getBase64(callback: (base64: string) => void): void;
    getDataUrl(callback: (dataUrl: string) => void): void;
    download(filename?: string): void;
    open(): void;
    print(): void;
  }

  interface BrowserPdfMake {
    vfs: Record<string, string>;
    fonts: Record<string, unknown>;
    addVirtualFileSystem?(vfs: Record<string, string>): void;
    addFontContainer?(fontContainer: {
      vfs: Record<string, string>;
      fonts?: Record<string, unknown>;
    }): void;
    createPdf(
      docDefinition: TDocumentDefinitions,
      tableLayouts?: Record<string, unknown>,
      fonts?: Record<string, unknown>,
      vfs?: Record<string, string>
    ): BrowserOutputDocument;
  }

  const pdfMake: BrowserPdfMake;
  export default pdfMake;
}
