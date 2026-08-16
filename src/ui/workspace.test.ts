// No jsdom. If any of this ever needs a DOM, the separation has broken.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  conclusionTokens,
  freeze,
  isComplete,
  parsePalette,
  seatSocket,
  template,
  variable,
  variableChip,
  type Chip,
  type Palette,
  type Template,
} from "../logic";
import { readPalette } from "../logic/fixtures";
import { clamp, parseSlot, slotPath, Workspace, type SlotRef } from "./workspace";

const palette: Palette = parsePalette(readPalette("prototype"), "prototype.json");
const wi = template(palette, "wi");
const ax1 = template(palette, "ax-1");
const axMp = template(palette, "ax-mp");
const chip = (name: string): Chip => variableChip(variable(palette, name));

const ph = chip("ph");

/** Fill every socket of a template and collapse it, the way a visitor would. */
function built(w: Workspace, t: Template, fills: Record<string, Chip>): Chip {
  let card = w.mint(t, 0, 0);
  for (const [name, fill] of Object.entries(fills)) card = seatSocket(card, name, fill);
  return freeze(card);
}

/** A workspace with one empty card of `t` already on the bench. */
function benchWith(t: Template): { w: Workspace; id: string } {
  const w = new Workspace();
  const card = w.add(w.mint(t, 0, 0), 20, 20);
  return { w, id: card.id };
}

describe("the workspace has no DOM in it", () => {
  // The whole point of the split: a pointer bug and a state bug must never be
  // confusable, and this half has to be testable without a browser. A rule that
  // lives only in a comment is one the next commit can break silently.
  const source = readFileSync(resolve("src/ui/workspace.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("touches no browser global", () => {
    for (const global of ["document", "window", "navigator", "ResizeObserver", "requestAnimationFrame"]) {
      expect(source, `workspace.ts references ${global}`).not.toMatch(
        new RegExp(`\\b${global}\\b`),
      );
    }
  });

  it("names no DOM type and imports only the logic layer", () => {
    expect(source).not.toMatch(/\bHTML[A-Za-z]*Element\b/);
    const specifiers = [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(specifiers).toEqual(["../logic"]);
  });
});

describe("slot paths", () => {
  it("round-trips a socket and a lock", () => {
    const socket: SlotRef = { cardId: "c3", kind: "socket", var: "ph" };
    const lock: SlotRef = { cardId: "c3", kind: "lock", index: 1 };
    expect(slotPath(socket)).toBe("c3/socket/ph");
    expect(slotPath(lock)).toBe("c3/lock/1");
    expect(parseSlot(slotPath(socket))).toEqual(socket);
    expect(parseSlot(slotPath(lock))).toEqual(lock);
  });

  it("returns null rather than throwing on anything else", () => {
    // The input is a DOM attribute, so it can be absent, stale or nonsense.
    for (const bad of ["", "c3", "c3/socket", "c3/nope/ph", "c3/lock/x", "c3/lock/-1"]) {
      expect(parseSlot(bad), bad).toBeNull();
    }
  });
});

describe("clamp", () => {
  const bench = { w: 600, h: 500 };

  it("keeps a card inside the bench", () => {
    expect(clamp(300, 200, { w: 100, h: 50 }, bench)).toEqual({ x: 300, y: 200 });
    expect(clamp(-40, -40, { w: 100, h: 50 }, bench)).toEqual({ x: 8, y: 34 });
    expect(clamp(9999, 9999, { w: 100, h: 50 }, bench)).toEqual({ x: 492, y: 442 });
  });

  it("keeps clear of the bench label", () => {
    expect(clamp(50, 0, { w: 100, h: 50 }, bench).y).toBe(34);
  });

  it("gives up gracefully on a card wider than the bench", () => {
    // Nothing to clamp between, so it goes to the left edge and overflows right,
    // where the bench's own scroll can still reach it.
    expect(clamp(200, 200, { w: 900, h: 50 }, bench).x).toBe(8);
  });
});

describe("lifting from the palette", () => {
  it("mints a card and never touches the palette", () => {
    const w = new Workspace();
    const carry = w.liftFromPalette(wi);
    expect(carry.card.template).toBe(wi);
    expect(w.cards).toEqual([]); // not on the bench until it is placed
    expect(carry.seatable).toBe(false); // wi has empty sockets
  });

  it("marks a variable chip seatable, because a slotless template is complete", () => {
    const w = new Workspace();
    expect(w.liftFromPalette(ph.template).seatable).toBe(true);
  });

  it("places on the bench, at the front", () => {
    const w = new Workspace();
    const first = w.add(w.mint(wi, 0, 0), 0, 0);
    w.liftFromPalette(wi);
    const placed = w.place(40, 60);
    expect(placed).toMatchObject({ x: 40, y: 60 });
    expect(placed!.z).toBeGreaterThan(first.z);
    expect(w.cards).toHaveLength(2);
    expect(w.carry).toBeNull();
  });

  it("evaporates on cancel, because nothing was created", () => {
    const w = new Workspace();
    w.liftFromPalette(wi);
    w.cancel();
    expect(w.cards).toEqual([]);
    expect(w.carry).toBeNull();
  });
});

describe("lifting a card off the bench", () => {
  it("takes it off the bench for the duration", () => {
    const { w, id } = benchWith(wi);
    w.liftCard(id);
    expect(w.cards).toEqual([]);
    expect(w.carry?.card.id).toBe(id);
  });

  it("puts it back exactly where it was on cancel", () => {
    const { w, id } = benchWith(wi);
    const before = w.find(id)!;
    w.liftCard(id);
    w.cancel();
    expect(w.find(id)).toEqual(before);
  });

  it("is gone for good on discard", () => {
    const { w, id } = benchWith(wi);
    w.liftCard(id);
    w.discard();
    expect(w.cards).toEqual([]);
  });

  it("cannot be seated while it is incomplete", () => {
    // An incomplete card drags to move and never highlights a slot.
    const { w, id } = benchWith(wi);
    expect(w.liftCard(id)?.seatable).toBe(false);
    expect(w.legalSlots()).toEqual([]);
  });

  it("cannot be seated while it is complete but expanded", () => {
    // A complete card the visitor has expanded is one they are taking apart,
    // not one they are about to use. `collapsed` is what makes it a chip.
    const w = new Workspace();
    let card = w.mint(wi, 0, 0);
    card = seatSocket(seatSocket(card, "ph", ph), "ps", ph);
    w.add({ ...card, collapsed: false }, 0, 0);
    expect(isComplete(card)).toBe(true);
    expect(w.liftCard(card.id)?.seatable).toBe(false);
  });
});

describe("legal slots", () => {
  it("offers every empty socket the carried chip's typecode fits", () => {
    const { w, id } = benchWith(wi);
    w.liftFromPalette(ph.template);
    expect(w.legalSlots()).toEqual([
      { cardId: id, kind: "socket", var: "ph" },
      { cardId: id, kind: "socket", var: "ps" },
    ]);
  });

  it("offers nothing while a socket is already filled", () => {
    const { w, id } = benchWith(wi);
    w.liftFromPalette(ph.template);
    w.seat({ cardId: id, kind: "socket", var: "ph" });
    w.liftFromPalette(ph.template);
    expect(w.legalSlots()).toEqual([{ cardId: id, kind: "socket", var: "ps" }]);
  });

  it("offers no lock while any socket is unfilled", () => {
    // The picture still holds variables, so there is nothing definite to match.
    const { w } = benchWith(axMp);
    w.liftFromPalette(ph.template);
    expect(w.legalSlots().filter((s) => s.kind === "lock")).toEqual([]);
  });

  it("offers a lock once its picture is definite and a chip matches it", () => {
    const w = new Workspace();
    const B = built(w, wi, { ph, ps: ph }); //          ( ph -> ph )
    const E = built(w, wi, { ph, ps: B }); //  ( ph -> ( ph -> ph ) )

    // ax-mp with ph := E, ps := B pictures lock 0 as |- ( ph -> ( ph -> ph ) ),
    // which is exactly what ax-1 with ph := ph, ps := ph derives.
    let mp = w.mint(axMp, 0, 0);
    mp = seatSocket(seatSocket(mp, "ph", E), "ps", B);
    w.add(mp, 0, 0);

    const step4 = built(w, ax1, { ph, ps: ph });
    w.liftFromPalette(step4.template);
    // The palette copy is an empty ax-1, not the derived one — no match yet.
    expect(w.legalSlots()).toEqual([]);

    w.discard();
    w.add({ ...w.mint(ax1, 0, 0), ...step4, collapsed: true }, 0, 0);
    const derived = w.cards.at(-1)!;
    w.liftCard(derived.id);
    expect(w.legalSlots()).toEqual([{ cardId: mp.id, kind: "lock", index: 0 }]);
  });
});

describe("seating", () => {
  it("consumes the carried card into the host", () => {
    const { w, id } = benchWith(wi);
    w.liftFromPalette(ph.template);
    const result = w.seat({ cardId: id, kind: "socket", var: "ph" });

    expect(result).toEqual({ completed: false });
    expect(w.carry).toBeNull();
    expect(w.cards).toHaveLength(1); // the chip did not also land on the bench
    expect(conclusionTokens(freeze(seatSocket(w.find(id)!, "ps", ph)))).toEqual([
      "wff", "(", "ph", "->", "ph", ")",
    ]);
  });

  it("reports the seat that completed the host, so the caller can sequence", () => {
    // Flash first, collapse after — never both at once.
    const { w, id } = benchWith(wi);
    w.liftFromPalette(ph.template);
    w.seat({ cardId: id, kind: "socket", var: "ph" });
    w.liftFromPalette(ph.template);
    expect(w.seat({ cardId: id, kind: "socket", var: "ps" })).toEqual({ completed: true });
    expect(w.find(id)!.collapsed).toBe(false); // not yet — that is the caller's move
  });

  it("refuses a slot the logic layer refuses", () => {
    const { w, id } = benchWith(wi);
    w.liftFromPalette(wi); // incomplete, so not a chip at all
    expect(w.canSeat({ cardId: id, kind: "socket", var: "ph" })).toBe(false);
    expect(w.seat({ cardId: id, kind: "socket", var: "ph" })).toBeNull();
    expect(w.carry).not.toBeNull(); // still in the air
  });
});

describe("ejecting from a socket", () => {
  /** wi with both sockets filled by ph chips, sitting on the bench. */
  function filledWi(): { w: Workspace; id: string } {
    const { w, id } = benchWith(wi);
    w.liftFromPalette(ph.template);
    w.seat({ cardId: id, kind: "socket", var: "ph" });
    w.liftFromPalette(ph.template);
    w.seat({ cardId: id, kind: "socket", var: "ps" });
    return { w, id };
  }

  it("clears the fill on lift, so the host reverts as you pull", () => {
    const { w, id } = filledWi();
    const carry = w.liftFromSocket(id, "ph");
    expect(carry?.seatable).toBe(true);
    expect(w.find(id)!.fills["ph"]).toBeUndefined();
    expect(isComplete(w.find(id)!)).toBe(false);
  });

  it("puts the chip back on cancel", () => {
    const { w, id } = filledWi();
    const before = w.find(id)!;
    w.liftFromSocket(id, "ph");
    w.cancel();
    expect(w.find(id)).toEqual(before);
  });

  it("pops the keys whose locks mentioned the variable, as loose cards", () => {
    const w = new Workspace();
    const B = built(w, wi, { ph, ps: ph });
    const E = built(w, wi, { ph, ps: B });
    const step4 = built(w, ax1, { ph, ps: ph });

    let mp = w.mint(axMp, 0, 0);
    mp = seatSocket(seatSocket(mp, "ph", E), "ps", B);
    w.add(mp, 40, 40);
    w.add({ ...w.mint(ax1, 0, 0), ...step4, collapsed: true }, 0, 0);
    const derived = w.cards.at(-1)!;
    w.liftCard(derived.id);
    w.seat({ cardId: mp.id, kind: "lock", index: 0 });

    expect(w.find(mp.id)!.keys[0]).not.toBeNull();
    const benchBefore = w.cards.length;

    // ax-mp's lock 0 is `|- ph`, so ejecting ph pops the key it was holding.
    const carry = w.liftFromSocket(mp.id, "ph");
    expect(carry).not.toBeNull();
    expect(w.find(mp.id)!.keys[0]).toBeNull();
    expect(w.cards).toHaveLength(benchBefore + 1); // the popped key, now loose

    const popped = w.cards.at(-1)!;
    expect(popped.collapsed).toBe(true);
    expect(isComplete(popped)).toBe(true);
  });

  it("re-seats the popped keys on cancel and clears the cards they became", () => {
    const w = new Workspace();
    const B = built(w, wi, { ph, ps: ph });
    const E = built(w, wi, { ph, ps: B });
    const step4 = built(w, ax1, { ph, ps: ph });

    let mp = w.mint(axMp, 0, 0);
    mp = seatSocket(seatSocket(mp, "ph", E), "ps", B);
    w.add(mp, 40, 40);
    w.add({ ...w.mint(ax1, 0, 0), ...step4, collapsed: true }, 0, 0);
    w.liftCard(w.cards.at(-1)!.id);
    w.seat({ cardId: mp.id, kind: "lock", index: 0 });

    const before = w.find(mp.id)!;
    const benchBefore = w.cards.length;

    w.liftFromSocket(mp.id, "ph");
    w.cancel();

    // Eject and re-seat is identity — the property M1R pinned, used in anger.
    expect(w.find(mp.id)).toEqual(before);
    expect(w.cards).toHaveLength(benchBefore);
  });
});

describe("ejecting a key", () => {
  it("takes the key out and pops nothing", () => {
    const w = new Workspace();
    const B = built(w, wi, { ph, ps: ph });
    const E = built(w, wi, { ph, ps: B });
    const step4 = built(w, ax1, { ph, ps: ph });

    let mp = w.mint(axMp, 0, 0);
    mp = seatSocket(seatSocket(mp, "ph", E), "ps", B);
    w.add(mp, 0, 0);
    w.add({ ...w.mint(ax1, 0, 0), ...step4, collapsed: true }, 0, 0);
    w.liftCard(w.cards.at(-1)!.id);
    w.seat({ cardId: mp.id, kind: "lock", index: 0 });

    const before = w.find(mp.id)!;
    const carry = w.liftFromLock(mp.id, 0);
    expect(carry?.seatable).toBe(true);
    expect(w.find(mp.id)!.keys[0]).toBeNull();
    expect(w.find(mp.id)!.fills["ph"]).toBeDefined(); // nothing else moved

    w.cancel();
    expect(w.find(mp.id)).toEqual(before);
  });
});

describe("collapse", () => {
  it("expands and re-collapses a complete card", () => {
    const { w, id } = benchWith(wi);
    w.liftFromPalette(ph.template);
    w.seat({ cardId: id, kind: "socket", var: "ph" });
    w.liftFromPalette(ph.template);
    w.seat({ cardId: id, kind: "socket", var: "ps" });

    w.collapse(id);
    expect(w.find(id)!.collapsed).toBe(true);
    w.toggleCollapsed(id);
    expect(w.find(id)!.collapsed).toBe(false);
    w.toggleCollapsed(id);
    expect(w.find(id)!.collapsed).toBe(true);
  });

  it("will not collapse a card that is not complete", () => {
    const { w, id } = benchWith(wi);
    w.collapse(id);
    w.toggleCollapsed(id);
    expect(w.find(id)!.collapsed).toBe(false);
  });
});
