import type {
  EventBus as TEventBus,
  PDFLinkService as TPDFLinkService,
  PDFViewer as TPDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import { viewportPositionToScaled } from "../lib/coordinates";
import {
  asElement,
  findOrCreateContainerLayer,
  getPageFromElement,
} from "../lib/pdfjs-dom";
import type {
  HighlightBindings,
  ScaledPosition,
  ViewportPosition,
} from "../types";

// Track containers that already have React roots to avoid duplicate createRoot calls
export const containerRoots = new WeakMap<HTMLElement, Root>();

export let EventBus: typeof TEventBus,
  PDFLinkService: typeof TPDFLinkService,
  PDFViewer: typeof TPDFViewer;

// Module-level promise to track when PDF.js modules are loaded
let pdfjsLoadedResolve!: () => void;
export const pdfjsLoaded = new Promise<void>((resolve) => {
  pdfjsLoadedResolve = resolve;
});

(async () => {
  // MUST set globalThis.pdfjsLib before importing pdf_viewer (required by pdfjs-dist v4+)
  const pdfjsLib = await import("pdfjs-dist");
  (globalThis as Record<string, unknown>).pdfjsLib = pdfjsLib;

  // Now safe to import the viewer
  const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
  EventBus = viewer.EventBus;
  PDFLinkService = viewer.PDFLinkService;
  PDFViewer = viewer.PDFViewer;
  pdfjsLoadedResolve();
})();

export const SCROLL_MARGIN = 10;
export const DEFAULT_SCALE_VALUE = "auto";
export const DEFAULT_TEXT_SELECTION_COLOR = "rgba(153,193,218,255)";

export const findOrCreateHighlightLayer = (textLayer: HTMLElement) => {
  return findOrCreateContainerLayer(
    textLayer,
    "PdfHighlighter__highlight-layer"
  );
};

export const disableTextSelection = (
  viewer: InstanceType<typeof PDFViewer>,
  flag: boolean
) => {
  viewer.viewer?.classList.toggle("PdfHighlighter--disable-selection", flag);
};

/**
 * Get or create highlight bindings for a given page.
 * Returns null if the page hasn't been rendered by the viewer yet.
 */
export function getOrCreatePageBindings(
  pageNumber: number,
  highlightBindingsRef: React.MutableRefObject<{
    [page: number]: HighlightBindings;
  }>,
  viewer: InstanceType<typeof PDFViewer>
): HighlightBindings | null {
  const existing = highlightBindingsRef.current[pageNumber];
  if (existing?.container?.isConnected) {
    return existing;
  }

  const { textLayer } = viewer.getPageView(pageNumber - 1) || {};
  if (!textLayer) {
    return null;
  }

  const highlightLayer = findOrCreateHighlightLayer(textLayer.div);
  if (!highlightLayer) {
    return null;
  }

  let reactRoot = containerRoots.get(highlightLayer);
  if (!reactRoot) {
    reactRoot = createRoot(highlightLayer);
    containerRoots.set(highlightLayer, reactRoot);
  }

  highlightBindingsRef.current[pageNumber] = {
    reactRoot,
    container: highlightLayer,
    textLayer: textLayer.div,
  };

  return highlightBindingsRef.current[pageNumber];
}

/**
 * Compute a ScaledPosition from a pointer event on a PDF page.
 * Used by freetext and image click-to-create handlers.
 */
export function getClickScaledPosition(
  event: React.PointerEvent,
  viewer: InstanceType<typeof PDFViewer>,
  defaultWidth: number,
  defaultHeight: number
): ScaledPosition | null {
  const target = asElement(event.target);
  const page = getPageFromElement(target);
  if (!page) {
    return null;
  }

  const pageRect = page.node.getBoundingClientRect();
  const viewportPosition: ViewportPosition = {
    boundingRect: {
      left: event.clientX - pageRect.left,
      top: event.clientY - pageRect.top,
      width: defaultWidth,
      height: defaultHeight,
      pageNumber: page.number,
    },
    rects: [],
  };

  return viewportPositionToScaled(viewportPosition, viewer);
}
