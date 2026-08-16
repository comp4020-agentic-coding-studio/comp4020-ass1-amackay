import { describe, expect, it } from "vitest";
import { outlinePath } from "./outline";

describe("outlinePath", () => {
  it("draws nothing for no rows", () => {
    expect(outlinePath([])).toBe("");
  });

  it("draws a rectangle for one row", () => {
    // A collapsed card is a one-row block, and the same code has to give it a
    // plain rectangle rather than a degenerate staircase.
    expect(outlinePath([{ w: 100, h: 30 }])).toBe("M 0 0 H 100 V 30 H 0 Z");
  });

  it("steps out where a row is wider than the one above", () => {
    // ( 60 wide ) then ( 200 wide ): out at the boundary, and the corner lands
    // exactly on it.
    expect(outlinePath([{ w: 60, h: 30 }, { w: 200, h: 40 }])).toBe(
      "M 0 0 H 60 V 30 H 200 V 70 H 0 Z",
    );
  });

  it("steps in where a row is narrower", () => {
    // The mirror case needs no special handling: it is the same H-then-V pair.
    expect(outlinePath([{ w: 200, h: 40 }, { w: 60, h: 30 }])).toBe(
      "M 0 0 H 200 V 40 H 60 V 70 H 0 Z",
    );
  });

  it("keeps stepping for as many rows as there are", () => {
    // ax-mp expanded: two socket rows, two lock rows, a conclusion.
    expect(
      outlinePath([
        { w: 90, h: 30 },
        { w: 90, h: 30 },
        { w: 150, h: 34 },
        { w: 220, h: 34 },
        { w: 120, h: 34 },
      ]),
    ).toBe("M 0 0 H 90 V 30 H 90 V 60 H 150 V 94 H 220 V 128 H 120 V 162 H 0 Z");
  });

  it("insets the outer edges and leaves the interior boundaries exact", () => {
    // The stroke is centred on the path, so the perimeter comes in by half of
    // it. A step is not a perimeter edge — inset it and it drifts off the row
    // it belongs to.
    expect(outlinePath([{ w: 60, h: 30 }, { w: 200, h: 40 }], 1)).toBe(
      "M 1 1 H 59 V 30 H 199 V 69 H 1 Z",
    );
  });

  it("rounds measured sizes, which arrive fractional", () => {
    expect(outlinePath([{ w: 100.333333, h: 29.666666 }], 1)).toBe(
      "M 1 1 H 99.33 V 28.67 H 1 Z",
    );
  });

  it("survives a block that has not been laid out yet", () => {
    // jsdom, and the frame before first paint: every measurement is zero. The
    // path must still be well-formed rather than NaN-ridden.
    expect(outlinePath([{ w: 0, h: 0 }], 1)).toBe("M 1 1 H -1 V -1 H 1 Z");
  });
});
