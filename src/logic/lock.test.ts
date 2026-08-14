import { describe, expect, it } from "vitest";
import {
  canFillLock,
  conclusionExpr,
  createInstance,
  fillFloat,
  fillLock,
  isComplete,
  variableExpr,
  type Expr,
  type Expression,
  type Statement,
} from "./index";

// ax-mp, with the $f floats it inherits from its enclosing scope and the two $e
// hypotheses from inside its ${ … $} flattened in — the first block with locks.
const AX_MP: Statement = {
  label: "ax-mp",
  floats: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  essentials: [
    ["|-", "ph"],
    ["|-", "(", "ph", "->", "ps", ")"],
  ],
  conclusion: ["|-", "ps"],
};

const ph = variableExpr({ label: "wph", var: "ph", typecode: "wff" });
const ps = variableExpr({ label: "wps", var: "ps", typecode: "wff" });

const derived = (tokens: Expression, label = "fixture"): Expr => ({
  tokens,
  provenance: { label, fills: {}, locks: [] },
});

/** ax-mp with ph := ph and ps := ps, so its essentials read `|- ph` and `|- ( ph -> ps )`. */
const filled = () => fillFloat(fillFloat(createInstance(AX_MP, "a"), "ph", ph), "ps", ps);

describe("canFillLock", () => {
  it("stays shut while any float is unfilled", () => {
    // The essential still contains variables, so there is nothing definite to
    // match against — not "no match", but "not yet a question".
    const empty = createInstance(AX_MP, "a");
    expect(canFillLock(empty, 0, derived(["|-", "ph"]))).toBe(false);

    const half = fillFloat(empty, "ph", ph);
    expect(canFillLock(half, 0, derived(["|-", "ph"]))).toBe(false);

    expect(canFillLock(filled(), 0, derived(["|-", "ph"]))).toBe(true);
  });

  it("accepts an exact match", () => {
    expect(canFillLock(filled(), 1, derived(["|-", "(", "ph", "->", "ps", ")"]))).toBe(true);
  });

  it("rejects a near-miss of one token", () => {
    // ps for ph in the consequent. Everything else is identical, and this is
    // the check the whole prototype is a dramatisation of.
    expect(canFillLock(filled(), 1, derived(["|-", "(", "ph", "->", "ph", ")"]))).toBe(false);
  });

  it("rejects a near-miss of one token's presence", () => {
    expect(canFillLock(filled(), 1, derived(["|-", "(", "ph", "->", "-.", "ps", ")"]))).toBe(false);
  });

  it("rejects a near-miss of length", () => {
    expect(canFillLock(filled(), 0, derived(["|-", "ph", "ps"]))).toBe(false);
  });

  it("rejects the right expression in the wrong slot", () => {
    const mp = filled();
    expect(canFillLock(mp, 0, derived(["|-", "(", "ph", "->", "ps", ")"]))).toBe(false);
    expect(canFillLock(mp, 1, derived(["|-", "ph"]))).toBe(false);
  });

  it("rejects a wff where a |- is wanted, on the same comparison", () => {
    // No separate typecode check: the instantiated essential leads with `|-`,
    // so a wff-typed piece simply fails to match on token one.
    expect(canFillLock(filled(), 0, derived(["wff", "ph"]))).toBe(false);
  });

  it("rejects a slot that is already satisfied", () => {
    const one = fillLock(filled(), 0, derived(["|-", "ph"]));
    expect(canFillLock(one, 0, derived(["|-", "ph"]))).toBe(false);
  });

  it("rejects an essential index the statement hasn't got", () => {
    expect(canFillLock(filled(), 7, derived(["|-", "ph"]))).toBe(false);
  });

  it("matches against the substituted essential, not the raw one", () => {
    // ph := -. ps, so hypothesis 0 reads `|- -. ps` and no longer `|- ph`.
    const mp = fillFloat(
      fillFloat(createInstance(AX_MP, "a"), "ph", derived(["wff", "-.", "ps"])),
      "ps",
      ps,
    );
    expect(canFillLock(mp, 0, derived(["|-", "ph"]))).toBe(false);
    expect(canFillLock(mp, 0, derived(["|-", "-.", "ps"]))).toBe(true);
  });
});

describe("fillLock", () => {
  it("throws on an illegal fill rather than failing quietly", () => {
    expect(() => fillLock(filled(), 0, derived(["|-", "ps"]))).toThrow(
      /does not satisfy hypothesis 0/,
    );
  });

  it("leaves the instance it was given untouched", () => {
    const before = filled();
    const after = fillLock(before, 0, derived(["|-", "ph"]));
    expect(before.locks).toEqual([null, null]);
    expect(after.locks).toEqual([{ label: "fixture", fills: {}, locks: [] }, null]);
  });

  it("completes the block only once every lock is satisfied", () => {
    const one = fillLock(filled(), 0, derived(["|-", "ph"], "step-1"));
    expect(isComplete(one)).toBe(false);

    const both = fillLock(one, 1, derived(["|-", "(", "ph", "->", "ps", ")"], "step-2"));
    expect(isComplete(both)).toBe(true);
    expect(conclusionExpr(both).tokens).toEqual(["|-", "ps"]);
  });

  it("records which derived statement satisfied each hypothesis", () => {
    const both = fillLock(
      fillLock(filled(), 0, derived(["|-", "ph"], "step-1")),
      1,
      derived(["|-", "(", "ph", "->", "ps", ")"], "step-2"),
    );
    expect(conclusionExpr(both).provenance.locks.map((l) => l?.label)).toEqual([
      "step-1",
      "step-2",
    ]);
  });
});
