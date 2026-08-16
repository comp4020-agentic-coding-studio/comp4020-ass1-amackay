// The bench, seeded.
//
// M2 has no interaction, so nothing would put a card on the bench — and every
// state the renderer has to get right (a filled socket, a live lock picture, a
// seated key, a collapsed one-liner, a run long enough to wrap) only exists on a
// populated bench. These are built through the logic layer's public API rather
// than hand-assembled, so the scene is a real derivation and cannot drift into
// showing something the model cannot produce.
//
// M3 replaces this with cards the visitor put there. Delete it then.

import {
  createCard,
  freeze,
  seatLock,
  seatSocket,
  template,
  thaw,
  variable,
  variableChip,
  type Card,
  type Chip,
  type Palette,
  type Placement,
  type Template,
} from "../logic";

let serial = 0;
const at = (x: number, y: number): Placement => ({ id: `s${(serial += 1)}`, x, y, z: serial });

/** Somewhere to build a chip; a chip keeps nothing about where its card sat. */
const NOWHERE: Placement = { id: "scratch", x: 0, y: 0, z: 0 };

export function scene(palette: Palette): Card[] {
  const wi = template(palette, "wi");
  const ax1 = template(palette, "ax-1");
  const ax2 = template(palette, "ax-2");
  const axMp = template(palette, "ax-mp");

  const chip = (name: string): Chip => variableChip(variable(palette, name));

  /** Fill every socket and collapse — how a visitor builds a wff out of wi. */
  const apply = (t: Template, fills: Record<string, Chip>): Chip => {
    let card = createCard(t, NOWHERE);
    for (const [name, fill] of Object.entries(fills)) card = seatSocket(card, name, fill);
    return freeze(card);
  };
  const imp = (antecedent: Chip, consequent: Chip): Chip =>
    apply(wi, { ph: antecedent, ps: consequent });

  // set.mm's idALT route, the same one the logic layer's acceptance test walks.
  const A = chip("ph");
  const B = imp(A, A); //                    ( ph -> ph )
  const C = imp(B, A);
  const D = imp(A, C);
  const E = imp(A, B); //          ( ph -> ( ph -> ph ) )
  const F = imp(E, B);

  const step1 = apply(ax1, { ph: A, ps: B });
  const step2 = apply(ax2, { ph: A, ps: B, ch: A });
  const step3 = freeze(
    seatLock(
      seatLock(seatSocket(seatSocket(createCard(axMp, NOWHERE), "ph", D), "ps", F), 0, step1),
      1,
      step2,
    ),
  );
  const step4 = apply(ax1, { ph: A, ps: A });
  const step5 = freeze(
    seatLock(
      seatLock(seatSocket(seatSocket(createCard(axMp, NOWHERE), "ph", E), "ps", B), 0, step4),
      1,
      step3,
    ),
  );

  // A deep chain of wi, for the wrap: four levels, so the conclusion is long
  // enough to break at 390px and nowhere near it at 1920.
  const w1 = imp(chip("ph"), chip("ps"));
  const w2 = imp(w1, chip("ch"));
  const w3 = imp(w2, w1);

  // Spaced for the tall case: every card wraps to more rows as the bench gets
  // narrower, and a seed scene that reads at 1920 and piles up at 390 would
  // hide the thing the phone viewport is there to check.
  return [
    // Empty sockets: two dashed notches waiting.
    createCard(wi, at(16, 16)),

    // One socket filled, one open — the staircase changes shape as it fills.
    seatSocket(createCard(wi, at(16, 200)), "ph", B),

    // Locks inert: the pictures still hold variables, so there is nothing
    // definite to match against yet.
    createCard(axMp, at(16, 400)),

    // Locks live, and the minor premise already keyed. The remaining picture is
    // the last step of ⊢ ( ph -> ph ).
    seatLock(
      seatSocket(seatSocket(createCard(axMp, at(16, 700)), "ph", E), "ps", B),
      0,
      step4,
    ),

    // Complete, collapsed, loose on the bench: the derivation, as a one-liner.
    thaw(step5, at(16, 1060)),

    // The wrap stress.
    seatSocket(seatSocket(createCard(wi, at(16, 1180)), "ph", w3), "ps", w2),
  ];
}
