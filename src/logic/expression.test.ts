import { describe, expect, it } from "vitest";
import { instantiate, same, type Expr, type Expression } from "./index";

/** A bare piece with provenance the substitution core never looks at. */
const piece = (tokens: Expression): Expr => ({
  tokens,
  provenance: { label: "fixture", fills: {}, locks: [] },
});

const fills = (entries: Record<string, Expression>): Map<string, Expr> =>
  new Map(Object.entries(entries).map(([name, tokens]) => [name, piece(tokens)]));

// ax-1's conclusion, where `ph` occurs twice — the case a naive replace-first
// implementation gets half right.
const AX1: Expression = ["|-", "(", "ph", "->", "(", "ps", "->", "ph", ")", ")"];

describe("instantiate", () => {
  it("rewrites every occurrence of a variable, not just the first", () => {
    expect(instantiate(AX1, fills({ ph: ["wff", "-.", "ps"] }))).toEqual([
      "|-", "(", "-.", "ps", "->", "(", "ps", "->", "-.", "ps", ")", ")",
    ]);
  });

  it("substitutes simultaneously, so a swap is a swap", () => {
    // The case DESIGN.md singles out. One pass gives ( ps -> ( ph -> ps ) ).
    // Splicing one variable at a time would give ( ph -> ( ph -> ph ) ),
    // because the second pass eats what the first wrote.
    expect(instantiate(AX1, fills({ ph: ["wff", "ps"], ps: ["wff", "ph"] }))).toEqual([
      "|-", "(", "ps", "->", "(", "ph", "->", "ps", ")", ")",
    ]);
  });

  it("strips the typecode off whatever it splices in", () => {
    // Substituting a wff in whole would strand its `wff` token mid-statement.
    const result = instantiate(AX1, fills({ ph: ["wff", "(", "ch", "->", "ch", ")"] }));
    expect(result).not.toContain("wff");
    expect(result[0]).toBe("|-");
  });

  it("leaves an unfilled variable alone", () => {
    expect(instantiate(AX1, fills({ ph: ["wff", "ch"] }))).toContain("ps");
  });

  it("leaves the leading typecode alone", () => {
    // "wff" is a constant, so it can never be a float name — no special case.
    expect(instantiate(["wff", "-.", "ph"], fills({ ph: ["wff", "ps"] }))).toEqual([
      "wff", "-.", "ps",
    ]);
  });

  it("substitutes the empty wff to nothing", () => {
    // MIU declares `we $a wff $.` — an expression that is only its typecode.
    // Legal, and exactly the case an implementation assuming at least one
    // visible token gets wrong.
    expect(instantiate(["wff", "M", "x", "U"], fills({ x: ["wff"] }))).toEqual([
      "wff", "M", "U",
    ]);
  });

  it("changes nothing when there is nothing to fill", () => {
    expect(instantiate(AX1, new Map())).toEqual(AX1);
  });
});

describe("same", () => {
  it("accepts an exact match", () => {
    expect(same(["|-", "(", "ph", "->", "ph", ")"], ["|-", "(", "ph", "->", "ph", ")"])).toBe(true);
  });

  it("rejects a near-miss of one token", () => {
    expect(same(["|-", "(", "ph", "->", "ph", ")"], ["|-", "(", "ph", "->", "ps", ")"])).toBe(false);
  });

  it("rejects a near-miss of one token's presence", () => {
    expect(same(["|-", "ph"], ["|-", "-.", "ph"])).toBe(false);
  });

  it("rejects a near-miss of length", () => {
    expect(same(["|-", "ph"], ["|-", "ph", "ps"])).toBe(false);
  });
});
