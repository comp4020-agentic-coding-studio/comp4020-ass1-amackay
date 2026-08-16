// Deconstruction. Seating and ejecting are inverse operations, and the only
// thing that makes that non-trivial is the pop: a key satisfies a lock's
// *picture*, and a picture is drawn from the sockets, so emptying a socket can
// invalidate a key seated some time ago.

import { describe, expect, it } from "vitest";
import {
  canSeatLock,
  conclusionTokens,
  createCard,
  eject,
  ejectKey,
  freeze,
  instantiatedLocks,
  isComplete,
  seatLock,
  seatSocket,
  variableChip,
  type Card,
  type Chip,
  type Expression,
  type Placement,
  type Template,
} from "./index";

// Two locks, one mentioning each socket. Not a set.mm statement — it is the
// smallest shape that can tell "pop what depended on the variable" apart from
// "pop everything", which ax-mp cannot, since both its locks mention ph.
const PAIR: Template = {
  label: "fixture-pair",
  sockets: [
    { var: "ph", typecode: "wff" },
    { var: "ps", typecode: "wff" },
  ],
  locks: [
    ["|-", "ph"],
    ["|-", "ps"],
  ],
  conclusion: ["|-", "(", "ph", "->", "ps", ")"],
};

const ph = variableChip({ label: "wph", var: "ph", typecode: "wff" });
const ps = variableChip({ label: "wps", var: "ps", typecode: "wff" });

const derived = (conclusion: Expression, label = "fixture"): Chip => ({
  template: { label, sockets: [], locks: [], conclusion },
  fills: {},
  keys: [],
});

const at = (id: string): Placement => ({ id, x: 0, y: 0, z: 0 });

const negPh = derived(["wff", "-.", "ph"], "wn-ph");
const keyA = derived(["|-", "-.", "ph"], "step-a");
const keyB = derived(["|-", "ps"], "step-b");

/** PAIR with ph := -. ph and ps := ps, both locks keyed — a complete card. */
const complete = (): Card =>
  seatLock(
    seatLock(seatSocket(seatSocket(createCard(PAIR, at("a")), "ph", negPh), "ps", ps), 0, keyA),
    1,
    keyB,
  );

describe("eject", () => {
  it("hands back the chip and clears the socket", () => {
    const card = seatSocket(createCard(PAIR, at("a")), "ph", negPh);
    const out = eject(card, "ph");
    expect(out.chip).toBe(negPh);
    expect(out.card.fills["ph"]).toBeUndefined();
  });

  it("un-completes the card, so it stops being seatable", () => {
    // DESIGN's "uncollapsed complete cards are mutable": ejecting a fill takes
    // the card back out of chip-hood until it is refilled.
    const card = complete();
    expect(isComplete(card)).toBe(true);
    expect(isComplete(eject(card, "ph").card)).toBe(false);
  });

  it("leaves the card it was given untouched", () => {
    const before = complete();
    eject(before, "ph");
    expect(before.fills["ph"]).toBe(negPh);
    expect(before.keys).toEqual([keyA, keyB]);
  });

  it("throws on an empty socket rather than failing quietly", () => {
    expect(() => eject(createCard(PAIR, at("a")), "ph")).toThrow(/socket ph is empty/);
  });

  it("throws on a variable the template hasn't got", () => {
    expect(() => eject(complete(), "ch")).toThrow(/socket ch is empty/);
  });

  it("reverts the pictures of the locks that mentioned the variable", () => {
    const { card } = eject(complete(), "ph");
    expect(instantiatedLocks(card)).toEqual([
      ["|-", "ph"], // back to the raw variable
      ["|-", "ps"],
    ]);
  });
});

describe("pop reconciliation", () => {
  it("pops exactly the keys whose locks mention the ejected variable", () => {
    const { card, popped } = eject(complete(), "ph");
    expect(popped).toEqual([{ lockIndex: 0, chip: keyA }]);
    // Lock 1 says nothing about ph, so its key is still good and stays put. The
    // all-sockets-filled gate applies to seating, not to retention.
    expect(card.keys).toEqual([null, keyB]);
  });

  it("pops nothing when no lock mentions the variable", () => {
    // A socket used only by the conclusion: ejecting it invalidates no key.
    const soloTemplate: Template = {
      ...PAIR,
      locks: [["|-", "ps"]],
      conclusion: ["|-", "(", "ph", "->", "ps", ")"],
    };
    const card = seatLock(
      seatSocket(seatSocket(createCard(soloTemplate, at("a")), "ph", negPh), "ps", ps),
      0,
      keyB,
    );
    const { popped, card: after } = eject(card, "ph");
    expect(popped).toEqual([]);
    expect(after.keys).toEqual([keyB]);
  });

  it("pops nothing when the locks that mention it are unkeyed", () => {
    const card = seatSocket(seatSocket(createCard(PAIR, at("a")), "ph", negPh), "ps", ps);
    expect(eject(card, "ph").popped).toEqual([]);
  });

  it("pops in lock order", () => {
    // Both of ax-mp's locks mention ph, so both go, and the order the caller
    // gets them in is the order they sit in.
    const axMp: Template = {
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
    const minor = derived(["|-", "ph"], "minor");
    const major = derived(["|-", "(", "ph", "->", "ps", ")"], "major");
    const card = seatLock(
      seatLock(seatSocket(seatSocket(createCard(axMp, at("a")), "ph", ph), "ps", ps), 0, minor),
      1,
      major,
    );
    expect(eject(card, "ph").popped).toEqual([
      { lockIndex: 0, chip: minor },
      { lockIndex: 1, chip: major },
    ]);
  });

  it("pops even when the picture is textually unchanged", () => {
    // Socket ph filled by the bare `ph` chip: the picture reads `|- ph` both
    // before and after, so a before/after comparison would keep this key
    // seated. It pops anyway — the key was seated under a fill that is gone,
    // and keeping it would be keeping it on a coincidence.
    const card = seatLock(
      seatSocket(seatSocket(createCard(PAIR, at("a")), "ph", ph), "ps", ps),
      0,
      derived(["|-", "ph"], "step-a"),
    );
    expect(instantiatedLocks(card)[0]).toEqual(["|-", "ph"]);

    const { card: after, popped } = eject(card, "ph");
    expect(instantiatedLocks(after)[0]).toEqual(["|-", "ph"]);
    expect(popped.map((p) => p.lockIndex)).toEqual([0]);
  });

  it("pops the same locks whatever was seated in the sockets", () => {
    // What the literal rule buys: which locks pop is a fact about the template,
    // not about the chips. A rule comparing pictures would make the gesture
    // behave differently on two structurally identical cards — the previous
    // test being exactly the case where it diverges.
    const withChip = (fill: Chip) =>
      eject(
        seatLock(
          seatSocket(seatSocket(createCard(PAIR, at("a")), "ph", fill), "ps", ps),
          0,
          derived(["|-", ...conclusionTokens(fill).slice(1)], "step-a"),
        ),
        "ph",
      ).popped.map((p) => p.lockIndex);

    expect(withChip(ph)).toEqual(withChip(negPh));
  });

  it("leaves every surviving key still matching its lock's picture", () => {
    // The invariant that does hold after an eject. It is about the *picture*,
    // not about canSeatLock, which refuses every lock while a socket is empty.
    const before = complete();
    const { card } = eject(before, "ph");
    card.keys.forEach((key, i) => {
      if (key !== null) {
        expect(conclusionTokens(key)).toEqual(instantiatedLocks(card)[i]);
        expect(instantiatedLocks(card)[i]).toEqual(instantiatedLocks(before)[i]);
      }
    });
  });
});

describe("eject and reseat", () => {
  it("is identity on the card", () => {
    // Construction and deconstruction are inverse: seat and eject in opposite
    // order and nothing is left over.
    const before = complete();
    const { card, chip, popped } = eject(before, "ph");

    let back = seatSocket(card, "ph", chip);
    for (const { lockIndex, chip: key } of popped) back = seatLock(back, lockIndex, key);

    expect(back).toEqual(before);
    expect(freeze(back)).toEqual(freeze(before));
  });

  it("is identity through a thaw, so a chip survives being taken apart", () => {
    // The full deconstruct/reconstruct path: freeze, thaw somewhere else, pull
    // a socket, put it back.
    const chip = freeze(complete());
    const { card, chip: pulled, popped } = eject(complete(), "ph");

    let back = seatSocket(card, "ph", pulled);
    for (const { lockIndex, chip: key } of popped) back = seatLock(back, lockIndex, key);

    expect(freeze(back)).toEqual(chip);
  });

  it("refuses to reseat a popped key before the socket is refilled", () => {
    // The order is forced, and that is the point: the picture has to exist
    // before anything can match it.
    const { card, popped } = eject(complete(), "ph");
    expect(canSeatLock(card, popped[0].lockIndex, popped[0].chip)).toBe(false);
  });
});

describe("ejectKey", () => {
  it("hands back the key and empties the lock", () => {
    const { card, chip } = ejectKey(complete(), 0);
    expect(chip).toBe(keyA);
    expect(card.keys).toEqual([null, keyB]);
  });

  it("pops nothing: a key is substituted into nothing", () => {
    const { card } = ejectKey(complete(), 0);
    expect(instantiatedLocks(card)).toEqual(instantiatedLocks(complete()));
    expect(card.fills).toEqual(complete().fills);
  });

  it("leaves the card it was given untouched", () => {
    const before = complete();
    ejectKey(before, 0);
    expect(before.keys).toEqual([keyA, keyB]);
  });

  it("reseats to identity", () => {
    const before = complete();
    const { card, chip } = ejectKey(before, 1);
    expect(seatLock(card, 1, chip)).toEqual(before);
  });

  it("throws on an empty lock, and on one the template hasn't got", () => {
    expect(() => ejectKey(createCard(PAIR, at("a")), 0)).toThrow(/lock 0 has no key/);
    expect(() => ejectKey(complete(), 7)).toThrow(/lock 7 has no key/);
  });
});
