// Type declarations for pdfmake 0.3.x Node.js API

declare module "pdfmake" {
  import type { TDocumentDefinitions } from "pdfmake/interfaces";

  interface VirtualFileSystem {
    existsSync(name: string): boolean;
    readFileSync(name: string): Buffer;
    writeFileSync(name: string, data: Buffer): void;
  }

  interface FontDefinition {
    bold: string;
    bolditalics: string;
    italics: string;
    normal: string;
  }

  interface OutputDocument {
    getBase64(): Promise<string>;
    getBuffer(): Promise<Buffer>;
    getDataUrl(): Promise<string>;
    getStream(): Promise<NodeJS.ReadableStream>;
    write(filename: string): Promise<void>;
  }

  interface PdfMake {
    addFonts(fonts: Record<string, FontDefinition>): void;
    clearFonts(): void;
    createPdf(
      docDefinition: TDocumentDefinitions,
      options?: Record<string, unknown>
    ): OutputDocument;
    setFonts(fonts: Record<string, FontDefinition>): void;
    virtualfs: VirtualFileSystem;
  }

  const pdfmake: PdfMake;
  export default pdfmake;
}

declare module "pdfmake/build/vfs_fonts" {
  // In 0.3.x, vfs_fonts exports fonts directly as Record<string, string>
  const vfsFonts: Record<string, string>;
  export default vfsFonts;
}

declare module "pdfmake/build/standard-fonts/Times" {
  const timesFonts: {
    vfs: Record<string, unknown>;
    fonts: Record<string, unknown>;
  };
  export default timesFonts;
}

// Browser build type declarations
declare module "pdfmake/build/pdfmake" {
  import type { TDocumentDefinitions } from "pdfmake/interfaces";

  interface BrowserOutputDocument {
    download(filename?: string): void;
    getBase64(callback: (base64: string) => void): void;
    getBlob(callback: (blob: Blob) => void): void;
    getDataUrl(callback: (dataUrl: string) => void): void;
    open(): void;
    print(): void;
  }

  interface BrowserPdfMake {
    addFontContainer?(fontContainer: {
      vfs: Record<string, string>;
      fonts?: Record<string, unknown>;
    }): void;
    addVirtualFileSystem?(vfs: Record<string, string>): void;
    createPdf(
      docDefinition: TDocumentDefinitions,
      tableLayouts?: Record<string, unknown>,
      fonts?: Record<string, unknown>,
      vfs?: Record<string, string>
    ): BrowserOutputDocument;
    fonts: Record<string, unknown>;
    vfs: Record<string, string>;
  }

  const pdfMake: BrowserPdfMake;
  export default pdfMake;
}
