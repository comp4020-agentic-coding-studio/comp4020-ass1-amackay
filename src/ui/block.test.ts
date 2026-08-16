// @vitest-environment jsdom

// The renderer's contract with the interaction: every slot a chip could land in
// is addressable from the DOM, and every seated chip can be found again to pull
// it out. Drop resolution is elementFromPoint -> [data-slot] -> canSeat*, so a
// slot that renders without its path is a slot nothing can ever be dropped into.

import { describe, expect, it } from "vitest";
import {
  parsePalette,
  seatSocket,
  template,
  variable,
  variableChip,
  type Card,
  type Chip,
  type Palette,
} from "../logic";
import { readPalette } from "../logic/fixtures";
import { renderCard } from "./block";
import { parseSlot, Workspace } from "./workspace";

const palette: Palette = parsePalette(readPalette("prototype"), "prototype.json");
const wi = template(palette, "wi");
const axMp = template(palette, "ax-mp");
const ph: Chip = variableChip(variable(palette, "ph"));
const variables = new Set(palette.variables.map((v) => v.var));

const render = (card: Card): HTMLElement => renderCard(card, variables).element;
const paths = (el: HTMLElement, attribute: string): string[] =>
  [...el.querySelectorAll<HTMLElement>(`[data-${attribute}]`)].map(
    (n) => n.dataset[attribute] ?? "",
  );

describe("palette rendering", () => {
  it("draws no socket rows, and so offers no slot to drop into", () => {
    const w = new Workspace();
    const card = w.mint(wi, 0, 0);
    const element = renderCard(card, variables, { sockets: false }).element;

    expect(element.querySelectorAll(".row--socket")).toHaveLength(0);
    // A palette card is not on the bench, so a notch there would be a target
    // nothing could ever be seated in.
    expect(paths(element, "slot")).toEqual([]);
    expect(element.querySelectorAll(".row--conclusion")).toHaveLength(1);
  });

  it("keeps the lock rows, which say what the template still needs", () => {
    const w = new Workspace();
    const element = renderCard(w.mint(axMp, 0, 0), variables, { sockets: false }).element;

    expect(element.querySelectorAll(".row--lock")).toHaveLength(axMp.locks.length);
  });
});

describe("addressing", () => {
  it("gives every empty socket a slot path that parses back", () => {
    const w = new Workspace();
    const card = w.mint(wi, 0, 0);
    const found = paths(render(card), "slot");

    expect(found).toEqual([`${card.id}/socket/ph`, `${card.id}/socket/ps`]);
    expect(found.map(parseSlot)).toEqual([
      { cardId: card.id, kind: "socket", var: "ph" },
      { cardId: card.id, kind: "socket", var: "ps" },
    ]);
  });

  it("addresses a filled socket as seated, not as a slot", () => {
    const w = new Workspace();
    const card = seatSocket(w.mint(wi, 0, 0), "ph", ph);
    const element = render(card);

    expect(paths(element, "slot")).toEqual([`${card.id}/socket/ps`]);
    expect(paths(element, "seated")).toEqual([`${card.id}/socket/ph`]);
  });

  it("leaves an inert lock unaddressable", () => {
    // While a socket is unfilled the picture still holds variables, so there is
    // nothing definite to match against — and nothing to drop onto.
    const w = new Workspace();
    const card = w.mint(axMp, 0, 0);
    expect(paths(render(card), "slot")).toEqual([
      `${card.id}/socket/ph`,
      `${card.id}/socket/ps`,
    ]);
  });

  it("addresses a lock once its picture is definite", () => {
    const w = new Workspace();
    const card = seatSocket(seatSocket(w.mint(axMp, 0, 0), "ph", ph), "ps", ph);
    expect(paths(render(card), "slot")).toEqual([
      `${card.id}/lock/0`,
      `${card.id}/lock/1`,
    ]);
  });

  it("renders a collapsed card with no slots at all", () => {
    // A chip is locked closed: its slots are not the visitor's business until
    // they expand it.
    const w = new Workspace();
    const card = seatSocket(seatSocket(w.mint(wi, 0, 0), "ph", ph), "ps", ph);
    const element = render({ ...card, collapsed: true });
    expect(paths(element, "slot")).toEqual([]);
    expect(paths(element, "seated")).toEqual([]);
  });
});

describe("focus", () => {
  it("makes every card reachable by tab", () => {
    // The keyboard has to be able to lift whatever the pointer can.
    const w = new Workspace();
    expect(render(w.mint(wi, 0, 0)).tabIndex).toBe(0);
  });
});
