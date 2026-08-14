import { describe, expect, it } from "vitest";
import {
  canFillFloat,
  conclusionExpr,
  createInstance,
  fillFloat,
  instantiated,
  isComplete,
  variableExpr,
  type Expr,
  type Statement,
} from "./index";

// wi and ax-1, hand-built rather than read from the palette: this file is
// testing the block machinery, and a palette failure should not show up here.
const WI: Statement = {
  label: "wi",
  floats: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  essentials: [],
  conclusion: ["wff", "(", "ph", "->", "ps", ")"],
};

const AX1: Statement = {
  label: "ax-1",
  floats: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  essentials: [],
  conclusion: ["|-", "(", "ph", "->", "(", "ps", "->", "ph", ")", ")"],
};

const ph = variableExpr({ label: "wph", var: "ph", typecode: "wff" });
const ps = variableExpr({ label: "wps", var: "ps", typecode: "wff" });

/** A `|-` piece, which no wff-typed slot should ever accept. */
const derived: Expr = {
  tokens: ["|-", "ph"],
  provenance: { label: "fixture", fills: {}, locks: [] },
};

describe("variableExpr", () => {
  it("reads a $f declaration straight across", () => {
    expect(ph.tokens).toEqual(["wff", "ph"]);
    expect(ph.provenance).toEqual({ label: "wph", fills: {}, locks: [] });
  });
});

describe("createInstance", () => {
  it("opens one empty lock per essential hypothesis", () => {
    expect(createInstance(WI, "a").locks).toEqual([]);
    expect(createInstance({ ...WI, essentials: [["|-", "ph"]] }, "a").locks).toEqual([null]);
  });
});

describe("canFillFloat", () => {
  it("accepts a piece whose typecode matches the slot", () => {
    expect(canFillFloat(createInstance(WI, "a"), "ph", ph)).toBe(true);
  });

  it("rejects a piece of the wrong typecode", () => {
    // A wff-shaped notch only accepts wff-shaped pieces. No semantic
    // understanding of typecodes is required to play, and none is used here.
    expect(canFillFloat(createInstance(WI, "a"), "ph", derived)).toBe(false);
  });

  it("rejects a slot that is already filled", () => {
    const filled = fillFloat(createInstance(WI, "a"), "ph", ph);
    expect(canFillFloat(filled, "ph", ps)).toBe(false);
  });

  it("rejects a variable the statement hasn't got", () => {
    expect(canFillFloat(createInstance(WI, "a"), "ch", ph)).toBe(false);
  });
});

describe("fillFloat", () => {
  it("throws on an illegal fill rather than failing quietly", () => {
    expect(() => fillFloat(createInstance(WI, "a"), "ph", derived)).toThrow(/cannot fill ph/);
  });

  it("leaves the instance it was given untouched", () => {
    const before = createInstance(WI, "a");
    const after = fillFloat(before, "ph", ph);
    expect(before.fills.size).toBe(0);
    expect(after.fills.size).toBe(1);
    expect(after).not.toBe(before);
  });

  it("fills in any order", () => {
    const a = fillFloat(fillFloat(createInstance(WI, "a"), "ps", ps), "ph", ph);
    const b = fillFloat(fillFloat(createInstance(WI, "b"), "ph", ph), "ps", ps);
    expect(instantiated(a).conclusion).toEqual(instantiated(b).conclusion);
  });
});

describe("instantiated", () => {
  it("rewrites the whole block as each slot is filled", () => {
    const empty = createInstance(AX1, "a");
    expect(instantiated(empty).conclusion).toEqual(AX1.conclusion);

    const half = fillFloat(empty, "ph", { ...ph, tokens: ["wff", "-.", "ps"] });
    expect(instantiated(half).conclusion).toEqual([
      "|-", "(", "-.", "ps", "->", "(", "ps", "->", "-.", "ps", ")", ")",
    ]);
  });
});

describe("isComplete and conclusionExpr", () => {
  it("is incomplete while any float is unfilled", () => {
    const half = fillFloat(createInstance(AX1, "a"), "ph", ph);
    expect(isComplete(half)).toBe(false);
    expect(() => conclusionExpr(half)).toThrow(/not complete/);
  });

  it("is complete once every float is filled, when there are no locks", () => {
    const full = fillFloat(fillFloat(createInstance(AX1, "a"), "ph", ph), "ps", ps);
    expect(isComplete(full)).toBe(true);
    expect(conclusionExpr(full).tokens).toEqual(AX1.conclusion);
  });

  it("records what each slot was filled with", () => {
    const full = fillFloat(fillFloat(createInstance(WI, "a"), "ph", ph), "ps", ps);
    expect(conclusionExpr(full).provenance).toEqual({
      label: "wi",
      fills: {
        ph: { label: "wph", fills: {}, locks: [] },
        ps: { label: "wps", fills: {}, locks: [] },
      },
      locks: [],
    });
  });

  it("keeps provenance JSON-serialisable, so export stays possible", () => {
    // The Map lives on the instance; the exportable record is a plain object.
    // A Map here would stringify to {} and lose the proof silently.
    const full = fillFloat(fillFloat(createInstance(WI, "a"), "ph", ph), "ps", ps);
    const round = JSON.parse(JSON.stringify(conclusionExpr(full).provenance));
    expect(round).toEqual(conclusionExpr(full).provenance);
  });
});
