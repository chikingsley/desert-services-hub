import { PdfHighlighterContext } from "../contexts/pdf-highlighter-context";
import { DrawingCanvas } from "./drawing-canvas";
import { MouseSelection } from "./mouse-selection";
import { ShapeCanvas } from "./shape-canvas";
import { TipContainer } from "./tip-container";
import type { PdfHighlighterProps } from "./types";
import { usePdfHighlighter } from "./use-pdf-highlighter";

export type { PdfHighlighterProps } from "./types";

/**
 * This is a large-scale PDF viewer component designed to facilitate
 * highlighting. It should be used as a child to a {@link PdfLoader} to ensure
 * proper document loading. This does not itself render any highlights, but
 * instead its child should be the container component for each individual
 * highlight. This component will be provided appropriate HighlightContext for
 * rendering.
 *
 * @category Component
 */
export const PdfHighlighter = (props: PdfHighlighterProps) => {
  const {
    containerNodeRef,
    containerClassName,
    handleMouseDown,
    handleMouseUp,
    pdfHighlighterUtils,
    isViewerReady,
    viewer,
    updateTipPositionRef,
    onAreaSelectionChange,
    onAreaDragStart,
    onAreaReset,
    onAreaSelection,
    onDrawingCancel,
    onDrawingComplete,
    onShapeCancel,
    onShapeComplete,
  } = usePdfHighlighter(props);

  const {
    style,
    textSelectionColor = "rgba(153,193,218,255)",
    enableAreaSelection,
    mouseSelectionStyle,
    enableDrawingMode,
    drawingStrokeColor = "#000000",
    drawingStrokeWidth = 3,
    enableShapeMode,
    shapeStrokeColor = "#000000",
    shapeStrokeWidth = 2,
  } = props;

  return (
    <PdfHighlighterContext.Provider value={pdfHighlighterUtils}>
      <div
        className={containerClassName}
        onPointerDown={handleMouseDown}
        onPointerUp={handleMouseUp}
        ref={containerNodeRef}
        style={style}
      >
        <div className="pdfViewer" />
        <style>
          {`
          .textLayer ::selection {
            background: ${textSelectionColor};
          }
        `}
        </style>
        {isViewerReady && viewer && (
          <TipContainer
            updateTipPositionRef={updateTipPositionRef}
            viewer={viewer}
          />
        )}
        {isViewerReady && viewer && enableAreaSelection && (
          <MouseSelection
            enableAreaSelection={enableAreaSelection}
            onChange={onAreaSelectionChange}
            onDragStart={onAreaDragStart}
            onReset={onAreaReset}
            onSelection={onAreaSelection}
            style={mouseSelectionStyle}
            viewer={viewer}
          />
        )}
        {isViewerReady && viewer && enableDrawingMode && (
          <DrawingCanvas
            isActive={enableDrawingMode}
            onCancel={onDrawingCancel}
            onComplete={onDrawingComplete}
            strokeColor={drawingStrokeColor}
            strokeWidth={drawingStrokeWidth}
            viewer={viewer}
          />
        )}
        {isViewerReady && viewer && enableShapeMode && (
          <ShapeCanvas
            isActive={!!enableShapeMode}
            onCancel={onShapeCancel}
            onComplete={onShapeComplete}
            shapeType={enableShapeMode}
            strokeColor={shapeStrokeColor}
            strokeWidth={shapeStrokeWidth}
            viewer={viewer}
          />
        )}
      </div>
    </PdfHighlighterContext.Provider>
  );
};
