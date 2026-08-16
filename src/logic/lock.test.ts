import { describe, expect, it } from "vitest";
import {
  canSeatLock,
  conclusionTokens,
  createCard,
  freeze,
  instantiatedLocks,
  isComplete,
  seatLock,
  seatSocket,
  variableChip,
  type Chip,
  type Expression,
  type Placement,
  type Template,
} from "./index";

// ax-mp, with the $f floats it inherits from its enclosing scope and the two $e
// hypotheses from inside its ${ … $} flattened in — the first template with locks.
const AX_MP: Template = {
  label: "ax-mp",
  sockets: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  locks: [
    ["|-", "ph"],
    ["|-", "(", "ph", "->", "ps", ")"],
  ],
  conclusion: ["|-", "ps"],
};

const ph = variableChip({ label: "wph", var: "ph", typecode: "wff" });
const ps = variableChip({ label: "wps", var: "ps", typecode: "wff" });

/** A chip that simply reads as the tokens given — a slotless template. */
const derived = (conclusion: Expression, label = "fixture"): Chip => ({
  template: { label, sockets: [], locks: [], conclusion },
  fills: {},
  keys: [],
});

const at = (id: string): Placement => ({ id, x: 0, y: 0, z: 0 });

/** ax-mp with ph := ph and ps := ps, so its locks picture `|- ph` and `|- ( ph -> ps )`. */
const filled = () => seatSocket(seatSocket(createCard(AX_MP, at("a")), "ph", ph), "ps", ps);

describe("instantiatedLocks", () => {
  it("pictures the raw hypotheses while sockets are empty", () => {
    // Inert, but not blank: the picture is what the card is asking for, drawn
    // with variables where it doesn't know yet.
    expect(instantiatedLocks(createCard(AX_MP, at("a")))).toEqual(AX_MP.locks);
  });

  it("rewrites live as sockets fill", () => {
    const half = seatSocket(createCard(AX_MP, at("a")), "ph", derived(["wff", "-.", "ps"]));
    expect(instantiatedLocks(half)).toEqual([
      ["|-", "-.", "ps"],
      ["|-", "(", "-.", "ps", "->", "ps", ")"],
    ]);
  });
});

describe("canSeatLock", () => {
  it("stays shut while any socket is unfilled", () => {
    // The picture still contains variables, so there is nothing definite to
    // match against — not "no match", but "not yet a question".
    const empty = createCard(AX_MP, at("a"));
    expect(canSeatLock(empty, 0, derived(["|-", "ph"]))).toBe(false);

    const half = seatSocket(empty, "ph", ph);
    expect(canSeatLock(half, 0, derived(["|-", "ph"]))).toBe(false);

    expect(canSeatLock(filled(), 0, derived(["|-", "ph"]))).toBe(true);
  });

  it("accepts an exact match", () => {
    expect(canSeatLock(filled(), 1, derived(["|-", "(", "ph", "->", "ps", ")"]))).toBe(true);
  });

  it("rejects a near-miss of one token", () => {
    // ps for ph in the consequent. Everything else is identical, and this is
    // the check the whole prototype is a dramatisation of.
    expect(canSeatLock(filled(), 1, derived(["|-", "(", "ph", "->", "ph", ")"]))).toBe(false);
  });

  it("rejects a near-miss of one token's presence", () => {
    expect(canSeatLock(filled(), 1, derived(["|-", "(", "ph", "->", "-.", "ps", ")"]))).toBe(false);
  });

  it("rejects a near-miss of length", () => {
    expect(canSeatLock(filled(), 0, derived(["|-", "ph", "ps"]))).toBe(false);
  });

  it("rejects the right statement in the wrong lock", () => {
    const mp = filled();
    expect(canSeatLock(mp, 0, derived(["|-", "(", "ph", "->", "ps", ")"]))).toBe(false);
    expect(canSeatLock(mp, 1, derived(["|-", "ph"]))).toBe(false);
  });

  it("rejects a wff where a |- is wanted, on the same comparison", () => {
    // No separate typecode check: the picture leads with `|-`, so a wff-typed
    // chip simply fails to match on token one.
    expect(canSeatLock(filled(), 0, derived(["wff", "ph"]))).toBe(false);
  });

  it("rejects a lock that is already keyed", () => {
    const one = seatLock(filled(), 0, derived(["|-", "ph"]));
    expect(canSeatLock(one, 0, derived(["|-", "ph"]))).toBe(false);
  });

  it("rejects a lock index the template hasn't got", () => {
    expect(canSeatLock(filled(), 7, derived(["|-", "ph"]))).toBe(false);
  });

  it("matches against the instantiated picture, not the raw lock", () => {
    // ph := -. ps, so lock 0 pictures `|- -. ps` and no longer `|- ph`.
    const mp = seatSocket(
      seatSocket(createCard(AX_MP, at("a")), "ph", derived(["wff", "-.", "ps"])),
      "ps",
      ps,
    );
    expect(canSeatLock(mp, 0, derived(["|-", "ph"]))).toBe(false);
    expect(canSeatLock(mp, 0, derived(["|-", "-.", "ps"]))).toBe(true);
  });
});

describe("seatLock", () => {
  it("throws on an illegal seat rather than failing quietly", () => {
    expect(() => seatLock(filled(), 0, derived(["|-", "ps"]))).toThrow(
      /does not satisfy lock 0/,
    );
  });

  it("leaves the card it was given untouched", () => {
    const before = filled();
    const key = derived(["|-", "ph"]);
    const after = seatLock(before, 0, key);
    expect(before.keys).toEqual([null, null]);
    expect(after.keys).toEqual([key, null]);
  });

  it("completes the card only once every lock is keyed", () => {
    const one = seatLock(filled(), 0, derived(["|-", "ph"], "step-1"));
    expect(isComplete(one)).toBe(false);

    const both = seatLock(one, 1, derived(["|-", "(", "ph", "->", "ps", ")"], "step-2"));
    expect(isComplete(both)).toBe(true);
    expect(conclusionTokens(freeze(both))).toEqual(["|-", "ps"]);
  });

  it("keeps the chip that satisfied each lock, in lock order", () => {
    const both = seatLock(
      seatLock(filled(), 0, derived(["|-", "ph"], "step-1")),
      1,
      derived(["|-", "(", "ph", "->", "ps", ")"], "step-2"),
    );
    expect(freeze(both).keys.map((k) => k.template.label)).toEqual(["step-1", "step-2"]);
  });
});
