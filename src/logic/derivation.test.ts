// The acceptance test for the whole logic layer: derive ⊢ ( ph -> ph ) from
// ax-1, ax-2 and ax-mp, driven entirely through the public API in src/logic.
//
// It is set.mm's own idALT route (line 886), whose proof header is literally
// `( wi ax-1 ax-2 ax-mp )` — the exact primitives this palette ships — so the
// derivation has an external referent rather than being invented here. The
// target tokens are read out of the database too, so the test cannot be wrong
// in the same way the code is.

import { describe, expect, it } from "vitest";
import {
  canFillLock,
  conclusionExpr,
  createInstance,
  fillFloat,
  fillLock,
  instantiated,
  isComplete,
  parsePalette,
  statement,
  variableExpr,
  type BlockInstance,
  type Expr,
  type Statement,
} from "./index";
import { readPalette, setMm } from "./fixtures";

const palette = parsePalette(readPalette("prototype"), "prototype.json");

const wi = statement(palette, "wi");
const ax1 = statement(palette, "ax-1");
const ax2 = statement(palette, "ax-2");
const axMp = statement(palette, "ax-mp");

let serial = 0;
const block = (s: Statement): BlockInstance => createInstance(s, `b${(serial += 1)}`);

/** Fill every float of a block in one go and harvest its conclusion. */
function apply(s: Statement, fills: Record<string, Expr>): Expr {
  let instance = block(s);
  for (const [name, expr] of Object.entries(fills)) {
    instance = fillFloat(instance, name, expr);
  }
  return conclusionExpr(instance);
}

/** A wff built by hand, exactly as a visitor would build one from wi blocks. */
const imp = (antecedent: Expr, consequent: Expr): Expr =>
  apply(wi, { ph: antecedent, ps: consequent });

const chip = (name: string): Expr =>
  variableExpr(palette.variables.find((v) => v.var === name)!);

/** Everything after the typecode — how a wff reads once substituted into place. */
const body = (expr: Expr) => expr.tokens.slice(1);

describe("acceptance: ⊢ ( ph -> ph ) from ax-1, ax-2 and ax-mp", () => {
  // The wffs the derivation substitutes, built from wi blocks over a ph chip.
  const A = chip("ph"); //                                    ph
  const B = imp(A, A); //                                     ( ph -> ph )
  const C = imp(B, A); //                       ( ( ph -> ph ) -> ph )
  const D = imp(A, C); //             ( ph -> ( ( ph -> ph ) -> ph ) )
  const E = imp(A, B); //             ( ph -> ( ph -> ph ) )
  const F = imp(E, B); //   ( ( ph -> ( ph -> ph ) ) -> ( ph -> ph ) )

  it("builds its wffs the way a visitor would", () => {
    expect(B.tokens).toEqual(["wff", "(", "ph", "->", "ph", ")"]);
    expect(F.tokens).toEqual([
      "wff", "(", "(", "ph", "->", "(", "ph", "->", "ph", ")", ")",
      "->", "(", "ph", "->", "ph", ")", ")",
    ]);
  });

  // Step 1 — ax-1 with ph := ph, ps := ( ph -> ph ).
  const step1 = apply(ax1, { ph: A, ps: B });

  // Step 2 — ax-2 with ph := ph, ps := ( ph -> ph ), ch := ph.
  const step2 = apply(ax2, { ph: A, ps: B, ch: A });

  it("rewrites ax-mp's essentials under substitution before any lock is filled", () => {
    // Step 3 is the interesting one: ax-mp's two premises are hypotheses on the
    // block, and they only become matchable once its floats are filled. This is
    // the layer doing its actual work.
    let mp1 = block(axMp);
    mp1 = fillFloat(mp1, "ph", D);
    mp1 = fillFloat(mp1, "ps", F);

    expect(isComplete(mp1)).toBe(false);
    expect(instantiated(mp1).essentials).toEqual([
      ["|-", ...body(D)],
      ["|-", "(", ...body(D), "->", ...body(F), ")"],
    ]);

    // The premises are real premises, not interchangeable tokens: neither fits
    // the other's slot. Catches an index swap the happy path would hide.
    expect(canFillLock(mp1, 0, step2)).toBe(false);
    expect(canFillLock(mp1, 1, step1)).toBe(false);
    expect(canFillLock(mp1, 0, step1)).toBe(true);
    expect(canFillLock(mp1, 1, step2)).toBe(true);
  });

  // Step 3 — ax-mp, minor premise step 1, major premise step 2.
  const step3 = conclusionExpr(
    fillLock(
      fillLock(fillFloat(fillFloat(block(axMp), "ph", D), "ps", F), 0, step1),
      1,
      step2,
    ),
  );

  // Step 4 — ax-1 with ph := ph, ps := ph.
  const step4 = apply(ax1, { ph: A, ps: A });

  // Step 5 — ax-mp again, and the derivation closes.
  const step5 = conclusionExpr(
    fillLock(
      fillLock(fillFloat(fillFloat(block(axMp), "ph", E), "ps", B), 0, step4),
      1,
      step3,
    ),
  );

  it("reaches the statement set.mm calls id", () => {
    const id = setMm().statements.get("id");
    expect(id, "id is missing from the reference database").toBeDefined();
    expect(step5.tokens).toEqual(id!.conclusion);
    expect(step5.tokens).toEqual(["|-", "(", "ph", "->", "ph", ")"]);
  });

  it("keeps the proof it took to get there", () => {
    // Provenance is rendered nowhere, but it has to be there: un-collapse and
    // proof export are meant to stay possible without a model change.
    expect(step5.provenance.label).toBe("ax-mp");
    expect(step5.provenance.locks[1]?.label).toBe("ax-mp");
    expect(step5.provenance.locks[0]?.label).toBe("ax-1");
  });

  it("mutated nothing upstream along the way", () => {
    // Twenty-five operations later, the first chip and a fresh block are
    // untouched — the immutable fill API earning its keep.
    expect(A.tokens).toEqual(["wff", "ph"]);
    expect(block(wi).fills.size).toBe(0);
  });
});
