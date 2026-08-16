import { describe, expect, it } from "vitest";
import {
  conclusionTokens,
  variableChip,
  variableTemplate,
  type Chip,
  type Template,
} from "./index";

// wi and ax-1, hand-built rather than read from the palette: this file is
// testing the chip machinery, and a palette failure should not show up here.
const WI: Template = {
  label: "wi",
  sockets: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  locks: [],
  conclusion: ["wff", "(", "ph", "->", "ps", ")"],
};

const AX1: Template = {
  label: "ax-1",
  sockets: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  locks: [],
  // `ph` occurs twice — the case a naive replace-first implementation gets
  // half right.
  conclusion: ["|-", "(", "ph", "->", "(", "ps", "->", "ph", ")", ")"],
};

const ph = variableChip({ label: "wph", var: "ph", typecode: "wff" });
const ps = variableChip({ label: "wps", var: "ps", typecode: "wff" });

/** A chip built by hand. Legal only because these templates have no locks. */
const chip = (template: Template, fills: Record<string, Chip> = {}): Chip => ({
  template,
  fills,
  keys: [],
});

describe("variableTemplate and variableChip", () => {
  it("reads a $f declaration straight across", () => {
    expect(variableTemplate({ label: "wph", var: "ph", typecode: "wff" })).toEqual({
      label: "wph",
      sockets: [],
      locks: [],
      conclusion: ["wff", "ph"],
    });
  });

  it("makes a slotless template, so a variable chip is complete on arrival", () => {
    expect(ph.fills).toEqual({});
    expect(ph.keys).toEqual([]);
    expect(conclusionTokens(ph)).toEqual(["wff", "ph"]);
  });
});

describe("conclusionTokens", () => {
  it("rewrites every occurrence of a variable, not just the first", () => {
    const negPs = chip({ ...WI, label: "wn", sockets: [], conclusion: ["wff", "-.", "ps"] });
    expect(conclusionTokens(chip(AX1, { ph: negPs, ps }))).toEqual([
      "|-", "(", "-.", "ps", "->", "(", "ps", "->", "-.", "ps", ")", ")",
    ]);
  });

  it("substitutes simultaneously, so a swap is a swap", () => {
    // The case DESIGN.md singles out. One pass gives ( ps -> ( ph -> ps ) ).
    // Splicing one variable at a time would give ( ph -> ( ph -> ph ) ),
    // because the second pass eats what the first wrote. Recursing only through
    // complete chips is what makes simultaneity structural here.
    expect(conclusionTokens(chip(AX1, { ph: ps, ps: ph }))).toEqual([
      "|-", "(", "ps", "->", "(", "ph", "->", "ps", ")", ")",
    ]);
  });

  it("strips the typecode off every chip it splices in", () => {
    // Substituting a wff in whole would strand its `wff` token mid-statement.
    const result = conclusionTokens(chip(AX1, { ph: chip(WI, { ph, ps }), ps }));
    expect(result).not.toContain("wff");
    expect(result[0]).toBe("|-");
  });

  it("leaves an unfilled socket's variable alone", () => {
    // Only a complete chip can be seated, but the recursion must not depend on
    // that: an unfilled variable copies through as itself.
    expect(conclusionTokens(chip(AX1, { ph }))).toContain("ps");
  });

  it("recurses to any depth", () => {
    // wi inside wi inside ax-1 — the chain that stresses the renderer's wrap.
    const inner = chip(WI, { ph, ps }); //          ( ph -> ps )
    const outer = chip(WI, { ph: inner, ps: ph }); // ( ( ph -> ps ) -> ph )
    expect(conclusionTokens(chip(AX1, { ph: outer, ps: ph }))).toEqual([
      "|-", "(",
      "(", "(", "ph", "->", "ps", ")", "->", "ph", ")",
      "->", "(", "ph", "->",
      "(", "(", "ph", "->", "ps", ")", "->", "ph", ")",
      ")", ")",
    ]);
  });

  it("substitutes the empty wff to nothing", () => {
    // MIU declares `we $a wff $.` — a template whose conclusion is only its
    // typecode. Legal, and exactly the case an implementation assuming at least
    // one visible token gets wrong.
    const we = chip({ label: "we", sockets: [], locks: [], conclusion: ["wff"] });
    const mxu: Template = {
      label: "fixture",
      sockets: [{ var: "x", typecode: "wff" }],
      locks: [],
      conclusion: ["wff", "M", "x", "U"],
    };
    expect(conclusionTokens(chip(mxu, { x: we }))).toEqual(["wff", "M", "U"]);
  });

  it("recomputes rather than caching, so a chip carries no stale tokens", () => {
    // Chips are immutable and hold no token array of their own: the only place
    // the answer lives is the structure. Two chips built the same way read the
    // same, and neither has a field that could disagree.
    expect(Object.keys(chip(WI, { ph, ps }))).toEqual(["template", "fills", "keys"]);
    expect(conclusionTokens(chip(WI, { ph, ps }))).toEqual(
      conclusionTokens(chip(WI, { ph, ps })),
    );
  });
});
