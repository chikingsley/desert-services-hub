import type { Page } from "../types";

export const getDocument = (elm: Element | null | undefined): Document =>
  elm?.ownerDocument || document;

export const getWindow = (elm: Element | null | undefined): typeof window =>
  getDocument(elm)?.defaultView || window;

export const isHTMLElement = (elm: unknown): elm is HTMLElement =>
  elm instanceof HTMLElement ||
  (elm !== null &&
    typeof elm === "object" &&
    elm instanceof getWindow(elm as Element).HTMLElement);

export const isHTMLCanvasElement = (elm: unknown): elm is HTMLCanvasElement =>
  elm instanceof HTMLCanvasElement ||
  (elm !== null &&
    typeof elm === "object" &&
    elm instanceof getWindow(elm as Element).HTMLCanvasElement);

export const asElement = (x: EventTarget | Element | null): HTMLElement =>
  x as HTMLElement;

export const getPageFromElement = (target: HTMLElement): Page | null => {
  const node = asElement(target.closest(".page"));

  if (!(node && isHTMLElement(node))) {
    return null;
  }

  const number = Number(asElement(node).dataset.pageNumber);

  return { node, number } as Page;
};

export const getPagesFromRange = (range: Range): Page[] => {
  const startParentElement = range.startContainer.parentElement;
  const endParentElement = range.endContainer.parentElement;

  if (!(isHTMLElement(startParentElement) && isHTMLElement(endParentElement))) {
    return [] as Page[];
  }

  const startPage = getPageFromElement(asElement(startParentElement));
  const endPage = getPageFromElement(asElement(endParentElement));

  if (!(startPage?.number && endPage?.number)) {
    return [] as Page[];
  }

  if (startPage.number === endPage.number) {
    return [startPage] as Page[];
  }

  if (startPage.number === endPage.number - 1) {
    return [startPage, endPage] as Page[];
  }

  const pages: Page[] = [];

  let currentPageNumber = startPage.number;

  const document = startPage.node.ownerDocument;

  while (currentPageNumber <= endPage.number) {
    const currentPage = getPageFromElement(
      document.querySelector(
        `[data-page-number='${currentPageNumber}'`
      ) as HTMLElement
    );
    if (currentPage) {
      pages.push(currentPage);
    }
    currentPageNumber++;
  }

  return pages as Page[];
};

export const findOrCreateContainerLayer = (
  container: HTMLElement,
  className: string
): HTMLElement | null => {
  const doc = getDocument(container);
  let layer = container.querySelector(`.${className}`) as HTMLElement | null;

  // To ensure predictable zIndexing, wait until the pdfjs element has children.
  if (!layer && container.children.length) {
    layer = doc.createElement("div");
    layer.className = className;
    container.appendChild(layer);
  }

  return layer;
};
