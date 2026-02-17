import {
  type PointerEventHandler,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  PdfHighlighterContext,
  type PdfHighlighterUtils,
} from "../contexts/pdf-highlighter-context";
import { scaledToViewport, viewportPositionToScaled } from "../lib/coordinates";
import getBoundingRect from "../lib/get-bounding-rect";
import getClientRects from "../lib/get-client-rects";
import groupHighlightsByPage from "../lib/group-highlights-by-page";
import {
  asElement,
  getPagesFromRange,
  getWindow,
  isHTMLElement,
} from "../lib/pdfjs-dom";
import type {
  Content,
  GhostHighlight,
  Highlight,
  HighlightBindings,
  PdfSelection,
  Tip,
  ViewportPosition,
} from "../types";
import { HighlightLayer } from "./highlight-layer";
import type { PdfHighlighterProps } from "./pdf-highlighter-types";
import {
  DEFAULT_SCALE_VALUE,
  disableTextSelection,
  EventBus,
  getClickScaledPosition,
  getOrCreatePageBindings,
  PDFLinkService,
  PDFViewer,
  pdfjsLoaded,
  SCROLL_MARGIN,
} from "./pdf-highlighter-utils";

export function usePdfHighlighter({
  highlights,
  onScrollAway,
  pdfScaleValue = DEFAULT_SCALE_VALUE,
  onSelection: onSelectionFinished,
  onCreateGhostHighlight,
  onRemoveGhostHighlight,
  selectionTip,
  enableFreetextCreation,
  onFreetextClick,
  enableImageCreation,
  onImageClick,
  enableDrawingMode,
  onDrawingComplete,
  onDrawingCancel,
  enableShapeMode,
  onShapeComplete,
  onShapeCancel,
  areaSelectionMode,
  pdfDocument,
  children,
  utilsRef,
}: PdfHighlighterProps) {
  // State
  const [tip, setTip] = useState<Tip | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);

  // Refs
  const containerNodeRef = useRef<HTMLDivElement | null>(null);
  const highlightBindingsRef = useRef<Record<number, HighlightBindings>>({});
  const ghostHighlightRef = useRef<GhostHighlight | null>(null);
  const selectionRef = useRef<PdfSelection | null>(null);
  const scrolledToHighlightIdRef = useRef<string | null>(null);
  const isAreaSelectionInProgressRef = useRef(false);
  const isEditInProgressRef = useRef(false);
  const updateTipPositionRef = useRef(() => {
    /* replaced by TipContainer */
  });

  const eventBusRef = useRef<InstanceType<typeof EventBus> | null>(null);
  const linkServiceRef = useRef<InstanceType<typeof PDFLinkService> | null>(
    null
  );
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const viewerRef = useRef<InstanceType<typeof PDFViewer> | null>(null);

  // Utils
  const clearTextSelection = () => {
    selectionRef.current = null;
    const container = containerNodeRef.current;
    const selection = getWindow(container).getSelection();
    if (!(container && selection)) {
      return;
    }
    selection.removeAllRanges();
  };

  const toggleEditInProgress = (flag?: boolean) => {
    isEditInProgressRef.current =
      flag !== undefined ? flag : !isEditInProgressRef.current;
    if (viewerRef.current) {
      viewerRef.current.viewer?.classList.toggle(
        "PdfHighlighter--disable-selection",
        isEditInProgressRef.current
      );
    }
  };

  const removeGhostHighlight = () => {
    if (onRemoveGhostHighlight && ghostHighlightRef.current) {
      onRemoveGhostHighlight(ghostHighlightRef.current);
    }
    ghostHighlightRef.current = null;
    renderHighlightLayers();
  };

  // Render highlight layers
  const renderHighlightLayer = (
    highlightBindings: HighlightBindings,
    pageNumber: number
  ) => {
    if (!viewerRef.current) {
      return;
    }

    highlightBindings.reactRoot.render(
      <PdfHighlighterContext.Provider value={pdfHighlighterUtils}>
        <HighlightLayer
          highlightBindings={highlightBindings}
          highlightsByPage={groupHighlightsByPage([
            ...highlights,
            ghostHighlightRef.current,
          ])}
          pageNumber={pageNumber}
          scrolledToHighlightId={scrolledToHighlightIdRef.current}
          viewer={viewerRef.current}
        >
          {children}
        </HighlightLayer>
      </PdfHighlighterContext.Provider>
    );
  };

  const renderHighlightLayers = () => {
    if (!viewerRef.current) {
      return;
    }

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const bindings = getOrCreatePageBindings(
        pageNumber,
        highlightBindingsRef,
        viewerRef.current
      );
      if (bindings) {
        renderHighlightLayer(bindings, pageNumber);
      }
    }
  };

  // Event handlers
  const handleScroll = () => {
    onScrollAway?.();
    scrolledToHighlightIdRef.current = null;
    renderHighlightLayers();
  };

  const handleMouseUp: PointerEventHandler = () => {
    const container = containerNodeRef.current;
    const selection = getWindow(container).getSelection();

    if (
      !(container && selection) ||
      selection.isCollapsed ||
      !viewerRef.current
    ) {
      return;
    }

    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!(range && container.contains(range.commonAncestorContainer))) {
      return;
    }

    const pages = getPagesFromRange(range);
    if (!pages || pages.length === 0) {
      return;
    }

    const rects = getClientRects(range, pages);
    if (rects.length === 0) {
      return;
    }

    const viewportPosition: ViewportPosition = {
      boundingRect: getBoundingRect(rects),
      rects,
    };

    const scaledPosition = viewportPositionToScaled(
      viewportPosition,
      viewerRef.current
    );

    const content: Content = {
      text: selection.toString().split("\n").join(" "),
    };

    selectionRef.current = {
      content,
      type: "text",
      position: scaledPosition,
      makeGhostHighlight: () => {
        ghostHighlightRef.current = {
          content,
          type: "text",
          position: scaledPosition,
        };
        onCreateGhostHighlight?.(ghostHighlightRef.current);
        clearTextSelection();
        renderHighlightLayers();
        return ghostHighlightRef.current;
      },
    };

    onSelectionFinished?.(selectionRef.current);
    selectionTip &&
      setTip({ position: viewportPosition, content: selectionTip });
  };

  const handleMouseDown: PointerEventHandler = (event) => {
    if (
      !isHTMLElement(event.target) ||
      asElement(event.target).closest(".PdfHighlighter__tip-container")
    ) {
      return;
    }

    // Freetext creation mode
    if (
      enableFreetextCreation?.(event.nativeEvent) &&
      onFreetextClick &&
      !isEditInProgressRef.current &&
      viewerRef.current
    ) {
      const pos = getClickScaledPosition(event, viewerRef.current, 150, 80);
      if (pos) {
        onFreetextClick(pos);
        return;
      }
    }

    // Image creation mode
    if (
      enableImageCreation?.(event.nativeEvent) &&
      onImageClick &&
      !isEditInProgressRef.current &&
      viewerRef.current
    ) {
      const pos = getClickScaledPosition(event, viewerRef.current, 150, 100);
      if (pos) {
        onImageClick(pos);
        return;
      }
    }

    setTip(null);
    clearTextSelection();
    removeGhostHighlight();
    toggleEditInProgress(false);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") {
      clearTextSelection();
      removeGhostHighlight();
      setTip(null);
    }
  };

  const handleScaleValue = () => {
    if (viewerRef.current) {
      viewerRef.current.currentScaleValue = pdfScaleValue.toString();
    }
  };

  const scrollToHighlight = (highlight: Highlight) => {
    const { boundingRect, usePdfCoordinates } = highlight.position;
    const pageNumber = boundingRect.pageNumber;

    viewerRef.current?.container.removeEventListener("scroll", handleScroll);

    const pageViewport = viewerRef.current?.getPageView(
      pageNumber - 1
    ).viewport;

    viewerRef.current?.scrollPageIntoView({
      pageNumber,
      destArray: [
        null,
        { name: "XYZ" },
        ...pageViewport.convertToPdfPoint(
          0,
          scaledToViewport(boundingRect, pageViewport, usePdfCoordinates).top -
            SCROLL_MARGIN
        ),
        0,
      ],
    });

    scrolledToHighlightIdRef.current = highlight.id;
    renderHighlightLayers();

    setTimeout(() => {
      viewerRef.current?.container.addEventListener("scroll", handleScroll, {
        once: true,
      });
    }, 100);
  };

  // Initialise PDF Viewer
  useLayoutEffect(() => {
    if (!containerNodeRef.current) {
      return;
    }

    let cancelled = false;

    const initViewer = async () => {
      await pdfjsLoaded;

      if (cancelled || !containerNodeRef.current) {
        return;
      }

      if (!eventBusRef.current) {
        eventBusRef.current = new EventBus();
      }
      if (!linkServiceRef.current) {
        linkServiceRef.current = new PDFLinkService({
          eventBus: eventBusRef.current,
          externalLinkTarget: 2,
        });
      }

      viewerRef.current =
        viewerRef.current ||
        new PDFViewer({
          container: containerNodeRef.current,
          eventBus: eventBusRef.current,
          textLayerMode: 2,
          removePageBorders: true,
          linkService: linkServiceRef.current,
        });

      viewerRef.current.setDocument(pdfDocument);
      linkServiceRef.current.setDocument(pdfDocument);
      linkServiceRef.current.setViewer(viewerRef.current);
      setIsViewerReady(true);
    };

    const timeoutId = setTimeout(initViewer, 100);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [pdfDocument]);

  // Initialise viewer event listeners
  useLayoutEffect(() => {
    if (!(containerNodeRef.current && isViewerReady && eventBusRef.current)) {
      return;
    }

    const eventBus = eventBusRef.current;

    resizeObserverRef.current = new ResizeObserver(handleScaleValue);
    resizeObserverRef.current.observe(containerNodeRef.current);

    const doc = containerNodeRef.current.ownerDocument;

    eventBus.on("textlayerrendered", renderHighlightLayers);
    eventBus.on("pagesinit", handleScaleValue);
    doc.addEventListener("keydown", handleKeyDown);

    renderHighlightLayers();

    return () => {
      eventBus.off("pagesinit", handleScaleValue);
      eventBus.off("textlayerrendered", renderHighlightLayers);
      doc.removeEventListener("keydown", handleKeyDown);
      resizeObserverRef.current?.disconnect();
    };
  }, [handleKeyDown, handleScaleValue, renderHighlightLayers, isViewerReady]);

  // Build utils
  const pdfHighlighterUtils: PdfHighlighterUtils = {
    isEditingOrHighlighting: () =>
      Boolean(selectionRef.current) ||
      Boolean(ghostHighlightRef.current) ||
      isAreaSelectionInProgressRef.current ||
      isEditInProgressRef.current,
    getCurrentSelection: () => selectionRef.current,
    getGhostHighlight: () => ghostHighlightRef.current,
    removeGhostHighlight,
    toggleEditInProgress,
    isEditInProgress: () => isEditInProgressRef.current,
    isSelectionInProgress: () =>
      Boolean(selectionRef.current) || isAreaSelectionInProgressRef.current,
    scrollToHighlight,
    getViewer: () => viewerRef.current,
    getTip: () => tip,
    setTip,
    updateTipPosition: updateTipPositionRef.current,
  };

  utilsRef(pdfHighlighterUtils);

  // Build container class name
  const isFreetextMode = enableFreetextCreation?.({} as MouseEvent) ?? false;
  const isImageMode = enableImageCreation?.({} as MouseEvent) ?? false;

  const containerClassName = [
    "PdfHighlighter",
    isFreetextMode && "PdfHighlighter--freetext-mode",
    isImageMode && "PdfHighlighter--image-mode",
    enableDrawingMode && "PdfHighlighter--drawing-mode",
    enableShapeMode && "PdfHighlighter--shape-mode",
    areaSelectionMode && "PdfHighlighter--area-mode",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    containerNodeRef,
    containerClassName,
    handleMouseDown,
    handleMouseUp,
    pdfHighlighterUtils,
    isViewerReady,
    viewer: viewerRef.current,
    updateTipPositionRef,
    onAreaSelectionChange: (isVisible: boolean) => {
      isAreaSelectionInProgressRef.current = isVisible;
    },
    onAreaDragStart: () => {
      if (viewerRef.current) {
        disableTextSelection(viewerRef.current, true);
      }
    },
    onAreaReset: () => {
      selectionRef.current = null;
      if (viewerRef.current) {
        disableTextSelection(viewerRef.current, false);
      }
    },
    onAreaSelection: (
      viewportPosition: ViewportPosition,
      scaledPosition: import("../types").ScaledPosition,
      image: string,
      resetSelection: () => void
    ) => {
      selectionRef.current = {
        content: { image },
        type: "area",
        position: scaledPosition,
        makeGhostHighlight: () => {
          ghostHighlightRef.current = {
            position: scaledPosition,
            type: "area",
            content: { image },
          };
          onCreateGhostHighlight?.(ghostHighlightRef.current);
          resetSelection();
          renderHighlightLayers();
          return ghostHighlightRef.current;
        },
      };
      onSelectionFinished?.(selectionRef.current);
      selectionTip &&
        setTip({ position: viewportPosition, content: selectionTip });
    },
    onDrawingCancel: () => onDrawingCancel?.(),
    onDrawingComplete: (
      dataUrl: string,
      position: import("../types").ScaledPosition,
      strokes: import("../types").DrawingStroke[]
    ) => onDrawingComplete?.(dataUrl, position, strokes),
    onShapeCancel: () => onShapeCancel?.(),
    onShapeComplete: (
      position: import("../types").ScaledPosition,
      shape: import("../types").ShapeData
    ) => onShapeComplete?.(position, shape),
  };
}
