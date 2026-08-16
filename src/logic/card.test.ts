import { describe, expect, it } from "vitest";
import {
  canSeatSocket,
  conclusionTokens,
  createCard,
  freeze,
  instantiatedConclusion,
  isComplete,
  seatSocket,
  variableChip,
  type Chip,
  type Placement,
  type Template,
} from "./index";

// wi and ax-1, hand-built rather than read from the palette: this file is
// testing the card machinery, and a palette failure should not show up here.
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
  conclusion: ["|-", "(", "ph", "->", "(", "ps", "->", "ph", ")", ")"],
};

const ph = variableChip({ label: "wph", var: "ph", typecode: "wff" });
const ps = variableChip({ label: "wps", var: "ps", typecode: "wff" });

/** A `|-` chip, which no wff-typed socket should ever accept. */
const derived: Chip = {
  template: { label: "fixture", sockets: [], locks: [], conclusion: ["|-", "ph"] },
  fills: {},
  keys: [],
};

const at = (id: string): Placement => ({ id, x: 0, y: 0, z: 0 });

describe("createCard", () => {
  it("opens one empty lock per essential hypothesis", () => {
    expect(createCard(WI, at("a")).keys).toEqual([]);
    expect(createCard({ ...WI, locks: [["|-", "ph"]] }, at("a")).keys).toEqual([null]);
  });

  it("takes its identity and position from the caller, and starts expanded", () => {
    // No module counter: minting ids here would make the layer impure and its
    // tests order-dependent, and the bench owns identity anyway.
    const card = createCard(WI, { id: "c7", x: 40, y: 12, z: 3 });
    expect({ id: card.id, x: card.x, y: card.y, z: card.z }).toEqual({
      id: "c7", x: 40, y: 12, z: 3,
    });
    expect(card.collapsed).toBe(false);
  });
});

describe("canSeatSocket", () => {
  it("accepts a chip whose typecode matches the socket", () => {
    expect(canSeatSocket(createCard(WI, at("a")), "ph", ph)).toBe(true);
  });

  it("rejects a chip of the wrong typecode", () => {
    // A wff-shaped notch only accepts wff-shaped chips. No semantic
    // understanding of typecodes is required to play, and none is used here.
    expect(canSeatSocket(createCard(WI, at("a")), "ph", derived)).toBe(false);
  });

  it("rejects a socket that is already filled", () => {
    const filled = seatSocket(createCard(WI, at("a")), "ph", ph);
    expect(canSeatSocket(filled, "ph", ps)).toBe(false);
  });

  it("rejects a variable the template hasn't got", () => {
    expect(canSeatSocket(createCard(WI, at("a")), "ch", ph)).toBe(false);
  });

  it("matches on the chip's conclusion, not its template's", () => {
    // A chip's typecode is the typecode of what it *derives*, which for a
    // slotless template is the same thing and for a filled one need not be.
    expect(conclusionTokens(ph)[0]).toBe("wff");
    expect(conclusionTokens(derived)[0]).toBe("|-");
  });
});

describe("seatSocket", () => {
  it("throws on an illegal seat rather than failing quietly", () => {
    expect(() => seatSocket(createCard(WI, at("a")), "ph", derived)).toThrow(
      /cannot seat \|- ph in socket ph/,
    );
  });

  it("leaves the card it was given untouched", () => {
    const before = createCard(WI, at("a"));
    const after = seatSocket(before, "ph", ph);
    expect(before.fills).toEqual({});
    expect(Object.keys(after.fills)).toEqual(["ph"]);
    expect(after).not.toBe(before);
  });

  it("seats in any order", () => {
    const a = seatSocket(seatSocket(createCard(WI, at("a")), "ps", ps), "ph", ph);
    const b = seatSocket(seatSocket(createCard(WI, at("b")), "ph", ph), "ps", ps);
    expect(instantiatedConclusion(a)).toEqual(instantiatedConclusion(b));
  });
});

describe("instantiatedConclusion", () => {
  it("rewrites the whole card as each socket is filled", () => {
    const empty = createCard(AX1, at("a"));
    expect(instantiatedConclusion(empty)).toEqual(AX1.conclusion);

    const negPs: Chip = {
      template: { label: "wn", sockets: [], locks: [], conclusion: ["wff", "-.", "ps"] },
      fills: {},
      keys: [],
    };
    const half = seatSocket(empty, "ph", negPs);
    expect(instantiatedConclusion(half)).toEqual([
      "|-", "(", "-.", "ps", "->", "(", "ps", "->", "-.", "ps", ")", ")",
    ]);
  });
});

describe("isComplete and freeze", () => {
  it("is incomplete while any socket is unfilled", () => {
    const half = seatSocket(createCard(AX1, at("a")), "ph", ph);
    expect(isComplete(half)).toBe(false);
    expect(() => freeze(half)).toThrow(/not complete/);
  });

  it("is complete once every socket is filled, when there are no locks", () => {
    const full = seatSocket(seatSocket(createCard(AX1, at("a")), "ph", ph), "ps", ps);
    expect(isComplete(full)).toBe(true);
    expect(conclusionTokens(freeze(full))).toEqual(AX1.conclusion);
  });

  it("records what each socket was filled with — the chip is the proof", () => {
    const full = seatSocket(seatSocket(createCard(WI, at("a")), "ph", ph), "ps", ps);
    expect(freeze(full)).toEqual({
      template: WI,
      fills: { ph, ps },
      keys: [],
    });
  });

  it("keeps a chip JSON-serialisable, so proof export stays possible", () => {
    // No Maps anywhere in the model. A Map here would stringify to {} and lose
    // the derivation silently.
    const full = seatSocket(seatSocket(createCard(WI, at("a")), "ph", ph), "ps", ps);
    const chip = freeze(full);
    expect(JSON.parse(JSON.stringify(chip))).toEqual(chip);
  });

  it("carries no card state into the chip", () => {
    // collapsed / x / y / z are the bench's, not the derivation's. A chip that
    // remembered where it was dropped would make two identical derivations
    // compare unequal.
    const full = seatSocket(seatSocket(createCard(WI, { id: "c1", x: 9, y: 9, z: 9 }), "ph", ph), "ps", ps);
    expect(Object.keys(freeze(full))).toEqual(["template", "fills", "keys"]);
  });
});
