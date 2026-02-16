import type { LTWHP } from "../types.js";

const sort = (rects: LTWHP[]) =>
  rects.sort((A, B) => {
    const top = (A.pageNumber || 0) * A.top - (B.pageNumber || 0) * B.top;

    if (top === 0) {
      return A.left - B.left;
    }

    return top;
  });

const overlaps = (A: LTWHP, B: LTWHP) =>
  A.pageNumber === B.pageNumber &&
  A.left <= B.left &&
  B.left <= A.left + A.width;

const sameLine = (A: LTWHP, B: LTWHP, yMargin = 5) =>
  A.pageNumber === B.pageNumber &&
  Math.abs(A.top - B.top) < yMargin &&
  Math.abs(A.height - B.height) < yMargin;

const inside = (A: LTWHP, B: LTWHP) =>
  A.pageNumber === B.pageNumber &&
  A.top > B.top &&
  A.left > B.left &&
  A.top + A.height < B.top + B.height &&
  A.left + A.width < B.left + B.width;

const nextTo = (A: LTWHP, B: LTWHP, xMargin = 10) => {
  const Aright = A.left + A.width;
  const Bright = B.left + B.width;

  return (
    A.pageNumber === B.pageNumber &&
    A.left <= B.left &&
    Aright <= Bright &&
    B.left - Aright <= xMargin
  );
};

const extendWidth = (A: LTWHP, B: LTWHP) => {
  // extend width of A to cover B
  A.width = Math.max(B.width - A.left + B.left, A.width);
};

/** Try to merge rect B into rect A if they're on the same line and overlap or are adjacent. */
const tryMerge = (A: LTWHP, B: LTWHP): boolean => {
  if (!sameLine(A, B)) {
    return false;
  }

  if (overlaps(A, B)) {
    extendWidth(A, B);
    A.height = Math.max(A.height, B.height);
    return true;
  }

  if (nextTo(A, B)) {
    extendWidth(A, B);
    return true;
  }

  return false;
};

/** Run a single merge pass over rects, marking merged rects for removal. */
const mergePass = (rects: LTWHP[], toRemove: Set<LTWHP>) => {
  for (const A of rects) {
    for (const B of rects) {
      if (A === B || toRemove.has(A) || toRemove.has(B)) {
        continue;
      }
      if (tryMerge(A, B)) {
        toRemove.add(B);
      }
    }
  }
};

const optimizeClientRects = (clientRects: LTWHP[]): LTWHP[] => {
  const rects = sort(clientRects);

  // Remove rects fully contained inside another rect
  const outerRects = rects.filter((rect) =>
    rects.every((other) => !inside(rect, other))
  );

  // Merge overlapping/adjacent rects on the same line (3 passes)
  const toRemove = new Set<LTWHP>();
  for (let pass = 0; pass < 3; pass++) {
    mergePass(outerRects, toRemove);
  }

  return outerRects.filter((rect) => !toRemove.has(rect));
};

export default optimizeClientRects;
