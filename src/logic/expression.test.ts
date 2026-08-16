import { describe, expect, it } from "vitest";
import { same, substitute, type Expression } from "./index";

/** An expansion table, as a lookup over the source tokens. */
const from =
  (table: Record<string, Expression>) =>
  (token: string): Expression | undefined =>
    table[token];

// ax-1's conclusion, where `ph` occurs twice — the case a naive replace-first
// implementation gets half right.
const AX1: Expression = ["|-", "(", "ph", "->", "(", "ps", "->", "ph", ")", ")"];

describe("substitute", () => {
  it("rewrites every occurrence of a variable, not just the first", () => {
    expect(substitute(AX1, from({ ph: ["wff", "-.", "ps"] }))).toEqual([
      "|-", "(", "-.", "ps", "->", "(", "ps", "->", "-.", "ps", ")", ")",
    ]);
  });

  it("substitutes simultaneously, so a swap is a swap", () => {
    // The case DESIGN.md singles out. One pass gives ( ps -> ( ph -> ps ) ).
    // Splicing one variable at a time would give ( ph -> ( ph -> ph ) ),
    // because the second pass eats what the first wrote.
    expect(substitute(AX1, from({ ph: ["wff", "ps"], ps: ["wff", "ph"] }))).toEqual([
      "|-", "(", "ps", "->", "(", "ph", "->", "ps", ")", ")",
    ]);
  });

  it("strips the typecode off whatever it splices in", () => {
    // Substituting a wff in whole would strand its `wff` token mid-statement.
    const result = substitute(AX1, from({ ph: ["wff", "(", "ch", "->", "ch", ")"] }));
    expect(result).not.toContain("wff");
    expect(result[0]).toBe("|-");
  });

  it("leaves a token with no expansion alone", () => {
    expect(substitute(AX1, from({ ph: ["wff", "ch"] }))).toContain("ps");
  });

  it("leaves the leading typecode alone", () => {
    // "wff" is a constant, so it can never be a socket variable — no special case.
    expect(substitute(["wff", "-.", "ph"], from({ ph: ["wff", "ps"] }))).toEqual([
      "wff", "-.", "ps",
    ]);
  });

  it("substitutes the empty wff to nothing", () => {
    // MIU declares `we $a wff $.` — an expression that is only its typecode.
    // Legal, and exactly the case an implementation assuming at least one
    // visible token gets wrong.
    expect(substitute(["wff", "M", "x", "U"], from({ x: ["wff"] }))).toEqual([
      "wff", "M", "U",
    ]);
  });

  it("changes nothing when there is nothing to expand", () => {
    expect(substitute(AX1, () => undefined)).toEqual(AX1);
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
