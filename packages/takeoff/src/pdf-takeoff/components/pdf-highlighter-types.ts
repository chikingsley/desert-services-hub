import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CSSProperties, ReactNode } from "react";
import type { PdfHighlighterUtils } from "../contexts/pdf-highlighter-context";
import type {
  DrawingStroke,
  GhostHighlight,
  Highlight,
  PdfScaleValue,
  PdfSelection,
  ScaledPosition,
  ShapeData,
  ShapeType,
} from "../types";

/**
 * The props type for {@link PdfHighlighter}.
 *
 * @category Component Properties
 */
export interface PdfHighlighterProps {
  /**
   * Array of all highlights to be organised and fed through to the child
   * highlight container.
   */
  highlights: Highlight[];

  /**
   * Event is called only once whenever the user changes scroll after
   * the autoscroll function, scrollToHighlight, has been called.
   */
  onScrollAway?(): void;

  /**
   * What scale to render the PDF at inside the viewer.
   */
  pdfScaleValue?: PdfScaleValue;

  /**
   * Callback triggered whenever a user finishes making a mouse selection or has
   * selected text.
   *
   * @param PdfSelection - Content and positioning of the selection. NOTE:
   * `makeGhostHighlight` will not work if the selection disappears.
   */
  onSelection?(PdfSelection: PdfSelection): void;

  /**
   * Callback triggered whenever a ghost (non-permanent) highlight is created.
   *
   * @param ghostHighlight - Ghost Highlight that has been created.
   */
  onCreateGhostHighlight?(ghostHighlight: GhostHighlight): void;

  /**
   * Callback triggered whenever a ghost (non-permanent) highlight is removed.
   *
   * @param ghostHighlight - Ghost Highlight that has been removed.
   */
  onRemoveGhostHighlight?(ghostHighlight: GhostHighlight): void;

  /**
   * Optional element that can be displayed as a tip whenever a user makes a
   * selection.
   */
  selectionTip?: ReactNode;

  /**
   * Condition to check before any mouse selection starts.
   *
   * @param event - mouse event associated with the new selection.
   * @returns - `True` if mouse selection should start.
   */
  enableAreaSelection?(event: MouseEvent): boolean;

  /**
   * When true, shows crosshair cursor indicating area selection mode is active.
   * Use this when area selection should be persistently enabled (not just on modifier key).
   */
  areaSelectionMode?: boolean;

  /**
   * Optional CSS styling for the rectangular mouse selection.
   */
  mouseSelectionStyle?: CSSProperties;

  /**
   * PDF document to view and overlay highlights.
   */
  pdfDocument: PDFDocumentProxy;

  /**
   * This should be a highlight container/renderer of some sorts. It will be
   * given appropriate context for a single highlight which it can then use to
   * render a TextHighlight, AreaHighlight, etc. in the correct place.
   */
  children: ReactNode;

  /**
   * Coloring for unhighlighted, selected text.
   */
  textSelectionColor?: string;

  /**
   * Creates a reference to the PdfHighlighterContext above the component.
   *
   * @param pdfHighlighterUtils - various useful tools with a PdfHighlighter.
   * See {@link PdfHighlighterContext} for more description.
   */
  utilsRef(pdfHighlighterUtils: PdfHighlighterUtils): void;

  /**
   * Style properties for the PdfHighlighter (scrollbar, background, etc.), NOT
   * the PDF.js viewer it encloses. If you want to edit the latter, use the
   * other style props like `textSelectionColor` or overwrite pdf_viewer.css
   */
  style?: CSSProperties;

  /**
   * Condition to check before freetext creation starts.
   *
   * @param event - mouse event associated with the click.
   * @returns - `True` if freetext creation should occur.
   */
  enableFreetextCreation?(event: MouseEvent): boolean;

  /**
   * Callback triggered when user clicks to create a freetext annotation.
   *
   * @param position - Scaled position where the click occurred.
   */
  onFreetextClick?(position: ScaledPosition): void;

  /**
   * Condition to check before image creation starts.
   *
   * @param event - mouse event associated with the click.
   * @returns - `True` if image creation should occur.
   */
  enableImageCreation?(event: MouseEvent): boolean;

  /**
   * Callback triggered when user clicks to create an image annotation.
   *
   * @param position - Scaled position where the click occurred.
   */
  onImageClick?(position: ScaledPosition): void;

  /**
   * Whether drawing mode is enabled.
   */
  enableDrawingMode?: boolean;

  /**
   * Callback triggered when a drawing is completed.
   *
   * @param dataUrl - The drawing as a PNG data URL.
   * @param position - Scaled position of the drawing on the page.
   * @param strokes - The stroke data for later editing.
   */
  onDrawingComplete?(
    dataUrl: string,
    position: ScaledPosition,
    strokes: DrawingStroke[]
  ): void;

  /**
   * Callback triggered when drawing is cancelled.
   */
  onDrawingCancel?(): void;

  /**
   * Stroke color for drawing mode.
   * @default "#000000"
   */
  drawingStrokeColor?: string;

  /**
   * Stroke width for drawing mode.
   * @default 3
   */
  drawingStrokeWidth?: number;

  /**
   * The type of shape to create, or null if shape mode is not active.
   */
  enableShapeMode?: ShapeType | null;

  /**
   * Callback triggered when a shape is completed.
   *
   * @param position - Scaled position of the shape on the page.
   * @param shape - The shape data (type, color, width).
   */
  onShapeComplete?(position: ScaledPosition, shape: ShapeData): void;

  /**
   * Callback triggered when shape creation is cancelled.
   */
  onShapeCancel?(): void;

  /**
   * Stroke color for shape mode.
   * @default "#000000"
   */
  shapeStrokeColor?: string;

  /**
   * Stroke width for shape mode.
   * @default 2
   */
  shapeStrokeWidth?: number;
}
