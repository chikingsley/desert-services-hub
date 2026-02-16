import {
  scaledPositionToViewport,
  type TakeoffAnnotation,
  type TakeoffToolType,
} from "@takeoff/pdf-takeoff";

interface Viewer {
  getPageView: (
    i: number
  ) =>
    | { div: HTMLElement; viewport: { width: number; height: number } }
    | undefined;
  pagesCount: number;
}

function removeExistingAnnotationLayers(): void {
  for (const el of document.querySelectorAll(".takeoff-annotation-layer")) {
    el.remove();
  }
}

function getAnnotationPageNumber(
  annotation: TakeoffAnnotation
): number | undefined {
  if (annotation.type === "count") {
    return annotation.position.boundingRect.pageNumber;
  }
  return annotation.points[0]?.pageNumber;
}

function groupAnnotationsByPage(
  annotations: TakeoffAnnotation[]
): Map<number, TakeoffAnnotation[]> {
  const grouped = new Map<number, TakeoffAnnotation[]>();
  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    const pageNumber = getAnnotationPageNumber(annotation);
    if (!pageNumber) {
      continue;
    }
    const existing = grouped.get(pageNumber);
    if (existing) {
      existing.push(annotation);
      continue;
    }
    grouped.set(pageNumber, [annotation]);
  }
  return grouped;
}

function ensureAnnotationLayer(pageDiv: HTMLElement): HTMLDivElement {
  const existingLayer = pageDiv.querySelector(
    ".takeoff-annotation-layer"
  ) as HTMLDivElement | null;
  if (existingLayer) {
    return existingLayer;
  }

  const layer = document.createElement("div");
  layer.className = "takeoff-annotation-layer";
  layer.style.cssText =
    "position: absolute; inset: 0; pointer-events: none; z-index: 5;";
  pageDiv.style.position = "relative";
  pageDiv.appendChild(layer);
  return layer;
}

function renderAnnotation(
  layer: HTMLDivElement,
  annotation: TakeoffAnnotation,
  viewport: { width: number; height: number },
  activeTool: TakeoffToolType | null,
  viewer: Viewer
): void {
  if (annotation.type === "count") {
    renderCountMarker(
      layer,
      annotation,
      activeTool,
      viewer,
      scaledPositionToViewport
    );
    return;
  }

  if (annotation.type === "polyline" && annotation.points.length >= 2) {
    renderPolyline(layer, annotation, viewport, activeTool);
    return;
  }

  if (annotation.type === "polygon" && annotation.points.length >= 3) {
    renderPolygon(layer, annotation, viewport, activeTool);
  }
}

/** Inject annotation DOM elements into the PDF viewer's page layers. */
export function injectAnnotationLayers(
  viewer: Viewer,
  annotations: TakeoffAnnotation[],
  activeTool: TakeoffToolType | null
): void {
  removeExistingAnnotationLayers();
  const annotationsByPage = groupAnnotationsByPage(annotations);

  for (const [pageNumber, pageAnnotations] of annotationsByPage.entries()) {
    const pageView = viewer.getPageView(pageNumber - 1);
    if (!pageView) {
      continue;
    }

    const layer = ensureAnnotationLayer(pageView.div);
    for (const annotation of pageAnnotations) {
      renderAnnotation(
        layer,
        annotation,
        pageView.viewport,
        activeTool,
        viewer
      );
    }
  }
}

function renderCountMarker(
  layer: HTMLElement,
  ann: TakeoffAnnotation & { type: "count" },
  activeTool: TakeoffToolType | null,
  viewer: unknown,
  scaledToViewport: typeof scaledPositionToViewport
): void {
  const viewportPos = scaledToViewport(
    ann.position,
    viewer as Parameters<typeof scaledPositionToViewport>[1]
  );
  const { left, top, width, height } = viewportPos.boundingRect;

  const marker = document.createElement("div");
  marker.className = "takeoff-count-marker";
  marker.dataset.annotationId = ann.id;
  marker.style.cssText = `
    position: absolute;
    left: ${left + width / 2}px;
    top: ${top + height / 2}px;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: ${ann.color};
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    cursor: ${activeTool ? "crosshair" : "grab"};
    pointer-events: auto;
    user-select: none;
  `;
  marker.textContent = String(ann.number);
  layer.appendChild(marker);
}

function renderPolyline(
  layer: HTMLElement,
  ann: TakeoffAnnotation & { type: "polyline" },
  viewport: { width: number; height: number },
  activeTool: TakeoffToolType | null
): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "takeoff-polyline");
  svg.dataset.annotationId = ann.id;
  svg.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    cursor: ${activeTool ? "crosshair" : "grab"};
  `;

  const viewportPoints = ann.points.map((p) => ({
    x: (viewport.width * p.x1) / p.width,
    y: (viewport.height * p.y1) / p.height,
  }));

  const pathD = viewportPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", ann.color);
  path.setAttribute("stroke-width", String(ann.strokeWidth));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.style.pointerEvents = "stroke";
  path.style.cursor = activeTool ? "crosshair" : "grab";

  svg.appendChild(path);
  layer.appendChild(svg);
}

function renderPolygon(
  layer: HTMLElement,
  ann: TakeoffAnnotation & { type: "polygon" },
  viewport: { width: number; height: number },
  activeTool: TakeoffToolType | null
): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "takeoff-polygon");
  svg.dataset.annotationId = ann.id;
  svg.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  `;

  const viewportPoints = ann.points.map((p) => ({
    x: (viewport.width * p.x1) / p.width,
    y: (viewport.height * p.y1) / p.height,
  }));

  const pointsStr = viewportPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const polygon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon"
  );
  polygon.setAttribute("points", pointsStr);
  polygon.setAttribute("fill", ann.color);
  polygon.setAttribute("fill-opacity", String(ann.fillOpacity));
  polygon.setAttribute("stroke", ann.color);
  polygon.setAttribute("stroke-width", String(ann.strokeWidth));
  polygon.setAttribute("stroke-linejoin", "round");
  polygon.style.pointerEvents = "fill";
  polygon.style.cursor = activeTool ? "crosshair" : "grab";

  svg.appendChild(polygon);
  layer.appendChild(svg);
}

/** Attach mousedown + contextmenu listeners to all annotation layers. */
export function attachAnnotationListeners(
  annotationById: Map<string, TakeoffAnnotation>,
  activeTool: TakeoffToolType | null,
  onDragStart: (
    id: string,
    clientX: number,
    clientY: number,
    type: "count" | "polyline" | "polygon"
  ) => void,
  onDelete: ((id: string) => void) | undefined
): () => void {
  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const annotationEl = target.closest("[data-annotation-id]") as HTMLElement;
    if (!annotationEl) {
      return;
    }

    const annId = annotationEl.dataset.annotationId;
    const ann = annId ? annotationById.get(annId) : undefined;
    if (!ann || activeTool) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    onDragStart(ann.id, e.clientX, e.clientY, ann.type);
  };

  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const annotationEl = target.closest("[data-annotation-id]") as HTMLElement;
    if (!annotationEl) {
      return;
    }

    e.preventDefault();
    const annId = annotationEl.dataset.annotationId;
    if (annId) {
      onDelete?.(annId);
    }
  };

  for (const layer of document.querySelectorAll(".takeoff-annotation-layer")) {
    layer.addEventListener("mousedown", handleMouseDown as EventListener);
    layer.addEventListener("contextmenu", handleContextMenu as EventListener);
  }

  return () => {
    for (const layer of document.querySelectorAll(
      ".takeoff-annotation-layer"
    )) {
      layer.removeEventListener("mousedown", handleMouseDown as EventListener);
      layer.removeEventListener(
        "contextmenu",
        handleContextMenu as EventListener
      );
    }
  };
}

/** Compute the updated fields for an annotation being dragged by (deltaX, deltaY). */
export function computeDragUpdate(
  ann: TakeoffAnnotation,
  viewer: {
    getPageView: (
      i: number
    ) => { viewport: { width: number; height: number } } | undefined;
  },
  deltaX: number,
  deltaY: number
): Partial<TakeoffAnnotation> | null {
  if (ann.type === "count") {
    const pageView = viewer.getPageView(
      ann.position.boundingRect.pageNumber - 1
    );
    if (!pageView) {
      return null;
    }
    const { width: vw, height: vh } = pageView.viewport;
    const br = ann.position.boundingRect;
    const sx = (deltaX / vw) * br.width;
    const sy = (deltaY / vh) * br.height;
    return {
      position: {
        ...ann.position,
        boundingRect: {
          ...br,
          x1: br.x1 + sx,
          y1: br.y1 + sy,
          x2: br.x2 + sx,
          y2: br.y2 + sy,
        },
      },
    };
  }

  if (
    (ann.type === "polyline" || ann.type === "polygon") &&
    ann.points.length > 0
  ) {
    const pageView = viewer.getPageView(ann.points[0].pageNumber - 1);
    if (!pageView) {
      return null;
    }
    const { width: vw, height: vh } = pageView.viewport;
    return {
      points: ann.points.map((p) => ({
        ...p,
        x1: p.x1 + (deltaX / vw) * p.width,
        y1: p.y1 + (deltaY / vh) * p.height,
      })),
    };
  }

  return null;
}
