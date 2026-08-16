// A block's perimeter is one path, not a border per row.
//
// Rows are shrink-to-fit, so a block's silhouette is a staircase that changes
// shape as slots fill. Drawing that with CSS borders means reasoning about which
// edge belongs to which row and suppressing the interior rules — arithmetic that
// took the design study several passes and broke every time a row changed width.
// One measured path has no edges to get wrong, and the same component serves the
// card perimeter, the dashed lock picture, and M3's hot legal-target highlight.

const SVG_NS = "http://www.w3.org/2000/svg";

/** Must match `--border-w`: the path is inset by half of it so the stroke lands inside. */
export const STROKE_W = 2;

export interface RowSize {
  w: number;
  h: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * The staircase, as an SVG path.
 *
 * Down the right-hand side, stepping in or out at every row boundary, then back
 * along the bottom and up the left. Widening and narrowing need no special case:
 * each row contributes the same `H` (its own width) then `V` (its bottom edge).
 *
 * `inset` pulls the outer edges in by half the stroke width. Interior boundaries
 * stay exact — they are steps in the outline, not edges of it, and insetting them
 * would pull the step away from the row it belongs to.
 */
export function outlinePath(rows: readonly RowSize[], inset = 0): string {
  if (rows.length === 0) return "";

  const parts = [`M ${round(inset)} ${round(inset)}`];
  let y = 0;
  rows.forEach((row, i) => {
    y += row.h;
    const isLast = i === rows.length - 1;
    parts.push(`H ${round(row.w - inset)}`, `V ${round(isLast ? y - inset : y)}`);
  });
  parts.push(`H ${round(inset)}`, "Z");
  return parts.join(" ");
}

/** The empty svg a block hangs its outline on. Sits behind the rows. */
export function createOutline(variant = ""): { svg: SVGSVGElement; path: SVGPathElement } {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", variant ? `outline outline--${variant}` : "outline");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  svg.append(path);
  return { svg, path };
}

/**
 * Draw the outline now, and again whenever a row changes size — which is what a
 * wrapping token run does the moment the bench gets narrower.
 *
 * Returns a disposer. `ResizeObserver` is guarded because the spec suite imports
 * the entry module under jsdom, which has no layout to observe; there the first
 * draw measures zeroes and nothing further happens, which is correct rather than
 * merely survivable.
 */
export function observeOutline(path: SVGPathElement, rows: readonly HTMLElement[]): () => void {
  const draw = (): void => {
    const sizes = rows.map((row) => ({ w: row.offsetWidth, h: row.offsetHeight }));
    path.setAttribute("d", outlinePath(sizes, STROKE_W / 2));
  };

  draw();
  if (typeof ResizeObserver === "undefined") return () => {};

  const observer = new ResizeObserver(draw);
  for (const row of rows) observer.observe(row);
  return () => observer.disconnect();
}
