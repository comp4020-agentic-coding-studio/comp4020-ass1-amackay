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
  canSeatLock,
  conclusionTokens,
  createCard,
  freeze,
  instantiatedLocks,
  isComplete,
  parsePalette,
  seatLock,
  seatSocket,
  template,
  variable,
  variableChip,
  type Card,
  type Chip,
  type Template,
} from "./index";
import { readPalette, setMm } from "./fixtures";

const palette = parsePalette(readPalette("prototype"), "prototype.json");

const wi = template(palette, "wi");
const ax1 = template(palette, "ax-1");
const ax2 = template(palette, "ax-2");
const axMp = template(palette, "ax-mp");

let serial = 0;
const card = (t: Template): Card =>
  createCard(t, { id: `c${(serial += 1)}`, x: 0, y: 0, z: 0 });

/** Fill every socket of a card in one go and collapse it to a chip. */
function apply(t: Template, fills: Record<string, Chip>): Chip {
  let instance = card(t);
  for (const [name, chip] of Object.entries(fills)) {
    instance = seatSocket(instance, name, chip);
  }
  return freeze(instance);
}

/** A wff built by hand, exactly as a visitor would build one from wi cards. */
const imp = (antecedent: Chip, consequent: Chip): Chip =>
  apply(wi, { ph: antecedent, ps: consequent });

const chip = (name: string): Chip => variableChip(variable(palette, name));

/** Everything after the typecode — how a wff reads once substituted into place. */
const body = (c: Chip) => conclusionTokens(c).slice(1);

describe("acceptance: ⊢ ( ph -> ph ) from ax-1, ax-2 and ax-mp", () => {
  // The wffs the derivation substitutes, built from wi cards over a ph chip.
  const A = chip("ph"); //                                    ph
  const B = imp(A, A); //                                     ( ph -> ph )
  const C = imp(B, A); //                       ( ( ph -> ph ) -> ph )
  const D = imp(A, C); //             ( ph -> ( ( ph -> ph ) -> ph ) )
  const E = imp(A, B); //             ( ph -> ( ph -> ph ) )
  const F = imp(E, B); //   ( ( ph -> ( ph -> ph ) ) -> ( ph -> ph ) )

  it("builds its wffs the way a visitor would", () => {
    expect(conclusionTokens(B)).toEqual(["wff", "(", "ph", "->", "ph", ")"]);
    expect(conclusionTokens(F)).toEqual([
      "wff", "(", "(", "ph", "->", "(", "ph", "->", "ph", ")", ")",
      "->", "(", "ph", "->", "ph", ")", ")",
    ]);
  });

  // Step 1 — ax-1 with ph := ph, ps := ( ph -> ph ).
  const step1 = apply(ax1, { ph: A, ps: B });

  // Step 2 — ax-2 with ph := ph, ps := ( ph -> ph ), ch := ph.
  const step2 = apply(ax2, { ph: A, ps: B, ch: A });

  it("rewrites ax-mp's lock pictures under substitution before any key is seated", () => {
    // Step 3 is the interesting one: ax-mp's two premises are locks on the card,
    // and they only become matchable once its sockets are filled. This is the
    // layer doing its actual work.
    let mp1 = card(axMp);
    mp1 = seatSocket(mp1, "ph", D);
    mp1 = seatSocket(mp1, "ps", F);

    expect(isComplete(mp1)).toBe(false);
    expect(instantiatedLocks(mp1)).toEqual([
      ["|-", ...body(D)],
      ["|-", "(", ...body(D), "->", ...body(F), ")"],
    ]);

    // The premises are real premises, not interchangeable tokens: neither fits
    // the other's lock. Catches an index swap the happy path would hide.
    expect(canSeatLock(mp1, 0, step2)).toBe(false);
    expect(canSeatLock(mp1, 1, step1)).toBe(false);
    expect(canSeatLock(mp1, 0, step1)).toBe(true);
    expect(canSeatLock(mp1, 1, step2)).toBe(true);
  });

  // Step 3 — ax-mp, minor premise step 1, major premise step 2.
  const step3 = freeze(
    seatLock(
      seatLock(seatSocket(seatSocket(card(axMp), "ph", D), "ps", F), 0, step1),
      1,
      step2,
    ),
  );

  // Step 4 — ax-1 with ph := ph, ps := ph.
  const step4 = apply(ax1, { ph: A, ps: A });

  // Step 5 — ax-mp again, and the derivation closes.
  const step5 = freeze(
    seatLock(
      seatLock(seatSocket(seatSocket(card(axMp), "ph", E), "ps", B), 0, step4),
      1,
      step3,
    ),
  );

  it("reaches the statement set.mm calls id", () => {
    const id = setMm().templates.get("id");
    expect(id, "id is missing from the reference database").toBeDefined();
    expect(conclusionTokens(step5)).toEqual(id!.conclusion);
    expect(conclusionTokens(step5)).toEqual(["|-", "(", "ph", "->", "ph", ")"]);
  });

  it("keeps the proof it took to get there", () => {
    // The chip *is* the proof: un-collapse and proof export need no second
    // record to stay in step with the tokens.
    expect(step5.template.label).toBe("ax-mp");
    expect(step5.keys[1].template.label).toBe("ax-mp");
    expect(step5.keys[0].template.label).toBe("ax-1");
    expect(step5.keys[1].keys.map((k) => k.template.label)).toEqual(["ax-1", "ax-2"]);
  });

  it("mutated nothing upstream along the way", () => {
    // Twenty-five operations later, the first chip and a fresh card are
    // untouched — the immutable seat API earning its keep.
    expect(conclusionTokens(A)).toEqual(["wff", "ph"]);
    expect(card(wi).fills).toEqual({});
  });
});
