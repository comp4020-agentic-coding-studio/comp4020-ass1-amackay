// The interaction, as a state machine over the logic layer — and with no DOM in
// it at all.
//
// Everything here is about *what happens*: what is lifted, where it may land,
// what a cancel puts back. Where the pointer is, which element is under it, and
// what any of it looks like belong to drag.ts and block.ts. Keeping the two
// apart is the same rule src/logic follows for the same reason: a pointer bug
// and a state bug must never be confusable, and this half can then be tested
// without a browser.

import {
  canSeatLock,
  canSeatSocket,
  createCard,
  eject,
  ejectKey,
  freeze,
  isComplete,
  seatLock,
  seatSocket,
  type Card,
  type Chip,
  type Popped,
  type Template,
} from "../logic";

/** Where a chip can sit. Sockets are named; locks are positional. */
export type SlotRef =
  | { cardId: string; kind: "socket"; var: string }
  | { cardId: string; kind: "lock"; index: number };

/** A stable string for a slot, used as a DOM id and as the flash key. */
export function slotPath(ref: SlotRef): string {
  return ref.kind === "socket"
    ? `${ref.cardId}/socket/${ref.var}`
    : `${ref.cardId}/lock/${ref.index}`;
}

/** The inverse. Returns null rather than throwing: the input is a DOM attribute. */
export function parseSlot(path: string): SlotRef | null {
  const [cardId, kind, rest] = path.split("/");
  if (!cardId || rest === undefined) return null;
  if (kind === "socket") return { cardId, kind, var: rest };
  if (kind === "lock") {
    const index = Number(rest);
    return Number.isInteger(index) && index >= 0 ? { cardId, kind, index } : null;
  }
  return null;
}

/** Where a carried card came from, and therefore what a cancel has to undo. */
export type Source =
  | { kind: "palette" }
  | { kind: "card"; x: number; y: number; z: number }
  | { kind: "socket"; cardId: string; var: string; popped: PoppedLoose[] }
  | { kind: "key"; cardId: string; lockIndex: number };

/**
 * A key that popped, and the loose card it became. The id is recorded rather
 * than searched for on cancel: two identical derivations are equal values, so
 * "find the loose card that looks like this chip" could pick the wrong one.
 */
export interface PoppedLoose extends Popped {
  looseId: string;
}

export interface Carry {
  card: Card;
  source: Source;
  /**
   * Whether this can be *seated*, as against merely moved. DESIGN: a chip is a
   * complete **collapsed** derivation — an expanded complete card is one the
   * visitor is taking apart, not one they are about to use.
   */
  seatable: boolean;
}

const seatable = (card: Card): boolean => isComplete(card) && card.collapsed;

/**
 * The bench and what is currently in the air.
 *
 * Mutable on purpose: this is the one place state lives, and the cards it holds
 * are the logic layer's immutable values. Every transition swaps a whole card
 * rather than editing one.
 */
export class Workspace {
  cards: Card[] = [];
  carry: Carry | null = null;

  #nextId = 0;
  #nextZ = 1;

  /** Cards render back-to-front, so z-order is the array order the UI walks. */
  ordered(): Card[] {
    return [...this.cards].sort((a, b) => a.z - b.z);
  }

  find(id: string): Card | undefined {
    return this.cards.find((card) => card.id === id);
  }

  #replace(card: Card): void {
    const at = this.cards.findIndex((c) => c.id === card.id);
    if (at === -1) this.cards.push(card);
    else this.cards[at] = card;
  }

  /**
   * A fresh card from a palette template, already at the front.
   *
   * A slotless template — a variable chip — is complete the moment it exists, so
   * it arrives collapsed. That is the same rule as auto-collapse-on-completion;
   * it just completes at birth, and being collapsed is what makes it a chip
   * rather than something you have to finish first.
   */
  mint(template: Template, x: number, y: number): Card {
    const card = createCard(template, {
      id: `c${(this.#nextId += 1)}`,
      x,
      y,
      z: (this.#nextZ += 1),
    });
    return isComplete(card) ? { ...card, collapsed: true } : card;
  }

  /** Put a card on the bench, at the front. */
  add(card: Card, x: number, y: number): Card {
    const placed = { ...card, x, y, z: (this.#nextZ += 1) };
    this.#replace(placed);
    return placed;
  }

  // ── lifting ──────────────────────────────────────────────────────────────

  /** A copy off the palette. The palette entry itself never changes. */
  liftFromPalette(template: Template): Carry {
    const card = this.mint(template, 0, 0);
    return (this.carry = { card, source: { kind: "palette" }, seatable: seatable(card) });
  }

  /** A whole card off the bench. It leaves the bench for the duration. */
  liftCard(id: string): Carry | null {
    const card = this.find(id);
    if (!card) return null;
    this.cards = this.cards.filter((c) => c.id !== id);
    return (this.carry = {
      card,
      source: { kind: "card", x: card.x, y: card.y, z: card.z },
      seatable: seatable(card),
    });
  }

  /**
   * A chip out of a socket. The fill clears **on lift**, so the host visibly
   * reverts to its notch and its conclusion back to variables — and any key
   * whose lock mentioned that variable pops, becoming a loose card where it sat.
   */
  liftFromSocket(cardId: string, varName: string): Carry | null {
    const host = this.find(cardId);
    if (!host || host.fills[varName] === undefined) return null;

    const { card, chip, popped } = eject(host, varName);
    this.#replace(card);

    // A popped key stays where it was and simply stops being seated.
    const loosened = popped.map((pop) => {
      const loose = this.#thawLoose(pop.chip, card);
      this.cards.push(loose);
      return { ...pop, looseId: loose.id };
    });

    return (this.carry = {
      card: this.#thawLoose(chip, host),
      source: { kind: "socket", cardId, var: varName, popped: loosened },
      seatable: true,
    });
  }

  /** A key out of a lock. Nothing pops: a key is substituted into nothing. */
  liftFromLock(cardId: string, index: number): Carry | null {
    const host = this.find(cardId);
    if (!host || host.keys[index] === undefined || host.keys[index] === null) return null;

    const { card, chip } = ejectKey(host, index);
    this.#replace(card);

    return (this.carry = {
      card: this.#thawLoose(chip, host),
      source: { kind: "key", cardId, lockIndex: index },
      seatable: true,
    });
  }

  /** A chip becomes a card again: complete, collapsed, loose, near where it was. */
  #thawLoose(chip: Chip, near: Card): Card {
    return {
      id: `c${(this.#nextId += 1)}`,
      template: chip.template,
      fills: { ...chip.fills },
      keys: [...chip.keys],
      collapsed: true,
      x: near.x + 16,
      y: near.y + 16,
      z: (this.#nextZ += 1),
    };
  }

  // ── landing ──────────────────────────────────────────────────────────────

  /** Every empty slot on the bench the carried card could legally fill. */
  legalSlots(): SlotRef[] {
    const chip = this.carriedChip();
    if (!chip) return [];

    const legal: SlotRef[] = [];
    for (const card of this.ordered()) {
      for (const socket of card.template.sockets) {
        if (canSeatSocket(card, socket.var, chip)) {
          legal.push({ cardId: card.id, kind: "socket", var: socket.var });
        }
      }
      card.template.locks.forEach((_, index) => {
        if (canSeatLock(card, index, chip)) legal.push({ cardId: card.id, kind: "lock", index });
      });
    }
    return legal;
  }

  /** The carried card as a chip, or null if it is not one. */
  carriedChip(): Chip | null {
    if (!this.carry?.seatable) return null;
    return freeze(this.carry.card);
  }

  canSeat(ref: SlotRef): boolean {
    const chip = this.carriedChip();
    const host = this.find(ref.cardId);
    if (!chip || !host) return false;
    return ref.kind === "socket"
      ? canSeatSocket(host, ref.var, chip)
      : canSeatLock(host, ref.index, chip);
  }

  /**
   * Seat the carried chip. The carried card is consumed — it *becomes* the
   * seated chip, which is why nothing needs putting back on the bench.
   *
   * Returns whether the host completed as a result, so the caller can sequence
   * the flash before the collapse rather than doing both at once.
   */
  seat(ref: SlotRef): { completed: boolean } | null {
    const chip = this.carriedChip();
    const host = this.find(ref.cardId);
    if (!chip || !host || !this.canSeat(ref)) return null;

    const filled =
      ref.kind === "socket" ? seatSocket(host, ref.var, chip) : seatLock(host, ref.index, chip);
    this.#replace(filled);
    this.carry = null;
    return { completed: isComplete(filled) };
  }

  /** Put the carried card down on the canvas. */
  place(x: number, y: number): Card | null {
    if (!this.carry) return null;
    const placed = this.add(this.carry.card, x, y);
    this.carry = null;
    return placed;
  }

  /** Throw the carried card away. Nothing is put back; there is no undo. */
  discard(): void {
    this.carry = null;
  }

  /**
   * Put everything back exactly as it was.
   *
   * The socket case is M1R's eject-and-reseat-is-identity property used in
   * anger: re-seat the chip, then every key that popped with it, and the host
   * is the card it was before the lift.
   */
  cancel(): void {
    const carry = this.carry;
    if (!carry) return;
    this.carry = null;

    const { source } = carry;
    if (source.kind === "palette") return;

    if (source.kind === "card") {
      this.#replace({ ...carry.card, x: source.x, y: source.y, z: source.z });
      return;
    }

    const host = this.find(source.cardId);
    if (!host) return;

    if (source.kind === "key") {
      this.#replace(seatLock(host, source.lockIndex, freeze(carry.card)));
      return;
    }

    let restored = seatSocket(host, source.var, freeze(carry.card));
    for (const { lockIndex, chip, looseId } of source.popped) {
      restored = seatLock(restored, lockIndex, chip);
      this.remove(looseId);
    }
    this.#replace(restored);
  }

  // ── the bench itself ─────────────────────────────────────────────────────

  remove(id: string): void {
    this.cards = this.cards.filter((card) => card.id !== id);
  }

  /** Expand a collapsed card, or collapse an expanded complete one. */
  toggleCollapsed(id: string): void {
    const card = this.find(id);
    if (!card) return;
    if (!card.collapsed && !isComplete(card)) return;
    this.#replace({ ...card, collapsed: !card.collapsed });
  }

  /** Collapse a card that has just completed. Sequenced after the flash. */
  collapse(id: string): void {
    const card = this.find(id);
    if (card && isComplete(card)) this.#replace({ ...card, collapsed: true });
  }

  bringToFront(id: string): void {
    const card = this.find(id);
    if (card) this.#replace({ ...card, z: (this.#nextZ += 1) });
  }

  /**
   * Pull every card back inside a bench that just changed size, using each
   * card's measured box. Returns whether anything actually moved, so a resize
   * that changed nothing does not cause a rebuild.
   *
   * A card also *grows* when it is seated into or when the bench narrows and its
   * run rewraps, so this is the same path that catches a card escaping downwards
   * after a fill — not only a window drag.
   */
  reclamp(
    bench: { w: number; h: number },
    sizeOf: (id: string) => { w: number; h: number } | null,
  ): boolean {
    let moved = false;
    this.cards = this.cards.map((card) => {
      const size = sizeOf(card.id);
      if (!size) return card;
      const at = clamp(card.x, card.y, size, bench);
      if (at.x === card.x && at.y === card.y) return card;
      moved = true;
      return { ...card, ...at };
    });
    return moved;
  }
}

export const EDGE = 8;
export const TOP_EDGE = 34; // clear of the "BENCH" label

/**
 * Keep a card inside the bench. If it is wider than the bench there is nothing
 * to clamp against, so it goes to the left edge and overflows to the right,
 * where the bench's own scroll can reach it.
 */
export function clamp(
  x: number,
  y: number,
  card: { w: number; h: number },
  bench: { w: number; h: number },
): { x: number; y: number } {
  const maxX = bench.w - card.w - EDGE;
  const maxY = bench.h - card.h - EDGE;
  return {
    x: maxX < EDGE ? EDGE : Math.min(Math.max(x, EDGE), maxX),
    y: maxY < TOP_EDGE ? TOP_EDGE : Math.min(Math.max(y, TOP_EDGE), maxY),
  };
}
