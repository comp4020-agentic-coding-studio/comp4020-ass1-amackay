import { conclusionTokens } from "./chip";
import { same, substitute } from "./expression";
import type { Card, Chip, Expression, Placement, Template, Token } from "./types";

/**
 * A fresh, empty card. `placement` is supplied rather than minted here: an id
 * from a module counter would make this layer impure and its tests
 * order-dependent, and the bench owns identity and position anyway.
 */
export function createCard(template: Template, placement: Placement): Card {
  return {
    id: placement.id,
    template,
    fills: {},
    keys: template.locks.map(() => null),
    collapsed: false,
    x: placement.x,
    y: placement.y,
    z: placement.z,
  };
}

/** Substitution under a card's *current* fills; an unfilled socket passes through. */
const under =
  (card: Card) =>
  (token: Token): Expression | undefined => {
    const fill = card.fills[token];
    return fill ? conclusionTokens(fill) : undefined;
  };

/**
 * Each lock under the current fills — the "pictures" a card draws of the
 * statements it is still waiting for. Unfilled socket variables pass through as
 * variable tokens, so a picture rewrites live as sockets fill.
 *
 * A pure function of `template` + `fills`: recompute, don't cache.
 */
export function instantiatedLocks(card: Card): Expression[] {
  return card.template.locks.map((lock) => substitute(lock, under(card)));
}

/**
 * The conclusion under the current fills — what the card *reads as* right now,
 * at any fill state. This is the display view; `freeze` is the harvest view, and
 * keeping them apart is what stops a half-filled conclusion from becoming a chip.
 */
export function instantiatedConclusion(card: Card): Expression {
  return substitute(card.template.conclusion, under(card));
}

/**
 * Whether every socket is filled. Exported because it is also the gate the
 * render draws: a lock picture is inert until this is true, and that has to be
 * the same question `canSeatLock` asks rather than a second opinion about it.
 */
export function socketsFilled(card: Card): boolean {
  return card.template.sockets.every((s) => card.fills[s.var] !== undefined);
}

/** A socket takes a chip whose typecode matches. That is the whole check. */
export function canSeatSocket(card: Card, varName: string, chip: Chip): boolean {
  const socket = card.template.sockets.find((s) => s.var === varName);
  return (
    socket !== undefined &&
    card.fills[varName] === undefined &&
    conclusionTokens(chip)[0] === socket.typecode
  );
}

/**
 * Seat a chip in a socket, returning a *new* card — nothing upstream is mutated.
 * DESIGN.md names only the predicates; the verbs are this layer's addition,
 * because a derivation has to be driveable through the public API.
 *
 * Throws on an illegal seat rather than returning null: the premise of the
 * design is that illegal moves are impossible (the UI asks `canSeatSocket` first
 * and only highlights legal targets), so a failed seat is a bug and should be loud.
 */
export function seatSocket(card: Card, varName: string, chip: Chip): Card {
  if (!canSeatSocket(card, varName, chip)) {
    throw new Error(
      `${card.template.label}: cannot seat ${conclusionTokens(chip).join(" ")} in socket ${varName}`,
    );
  }
  return { ...card, fills: { ...card.fills, [varName]: chip } };
}

/**
 * A lock takes a chip matching its instantiated picture *exactly*, and only once
 * every socket is filled — until then the picture still contains variables and
 * there is nothing definite to match against.
 *
 * One comparison, over the whole token array including the typecode. No separate
 * typecode check is needed or wanted: the picture starts with `|-` and so does
 * any candidate, and splitting this into a check across two shapes is exactly how
 * an "exact equality" test quietly starts passing near-misses.
 */
export function canSeatLock(card: Card, index: number, chip: Chip): boolean {
  const lock = card.template.locks[index];
  if (lock === undefined || card.keys[index] !== null) return false;
  if (!socketsFilled(card)) return false;
  return same(conclusionTokens(chip), substitute(lock, under(card)));
}

/** Seat a key in a lock, returning a *new* card. Throws on an illegal seat. */
export function seatLock(card: Card, index: number, chip: Chip): Card {
  if (!canSeatLock(card, index, chip)) {
    throw new Error(
      `${card.template.label}: ${conclusionTokens(chip).join(" ")} does not satisfy lock ${index}`,
    );
  }
  const keys = [...card.keys];
  keys[index] = chip;
  return { ...card, keys };
}

export function isComplete(card: Card): boolean {
  return socketsFilled(card) && card.keys.every((key) => key !== null);
}

/**
 * Collapse a complete card into the chip it derives. Throws unless complete — a
 * conclusion under partial fills is something to look at, not something to use.
 *
 * The fills are rebuilt from `template.sockets` rather than copied wholesale, so
 * a chip carries exactly one fill per socket and no strays. That is what makes
 * `freeze(thaw(chip))` identity rather than merely equivalent.
 */
export function freeze(card: Card): Chip {
  if (!isComplete(card)) {
    throw new Error(`${card.template.label}: card is not complete`);
  }
  const fills: Record<string, Chip> = {};
  // isComplete has just established that every socket is filled and every lock
  // keyed, which is what these assertions are standing on.
  for (const socket of card.template.sockets) fills[socket.var] = card.fills[socket.var]!;
  return { template: card.template, fills, keys: card.keys.map((key) => key!) };
}

/**
 * The inverse: a chip back to a card, complete and collapsed. Used when a chip
 * is ejected onto the bench, or popped out of a lock — both leave something the
 * visitor can pick up and take apart again.
 *
 * Construction and deconstruction are inverse, so the round trip has to be
 * identity on the derivation: `freeze(thaw(chip, anywhere))` is `chip`. Nothing
 * about where the card sat can reach the chip, which is why `Placement` is an
 * argument here and not something a chip remembers.
 */
export function thaw(chip: Chip, placement: Placement): Card {
  return {
    id: placement.id,
    template: chip.template,
    fills: { ...chip.fills },
    keys: [...chip.keys],
    collapsed: true,
    x: placement.x,
    y: placement.y,
    z: placement.z,
  };
}

/** A key unseated by an eject, and the lock it came out of. */
export interface Popped {
  lockIndex: number;
  chip: Chip;
}

/**
 * Pull a chip out of a socket, and unseat every key whose lock mentions that
 * variable — the lock's picture no longer says what the key satisfies, so the
 * key **pops**. Popped keys are returned in lock order; the caller turns them
 * into loose cards where they already sit.
 *
 * "Mentions" is literal: the variable appears as a token in the *raw*
 * `template.locks[i]`. The alternative — pop only where the picture textually
 * changed — differs in exactly one case, a socket filled by the bare variable
 * chip of the same name, and it is the worse rule twice over. A key stands for
 * "this derivation satisfies that hypothesis *under these fills*", so when a
 * fill it depended on goes, keeping the key keeps it on a coincidence. And the
 * literal rule is the one that makes this gesture depend only on the template:
 * the same eject on two structurally identical cards pops the same locks,
 * whatever happens to be seated in them.
 *
 * Keys in locks that don't mention the variable stay seated: the
 * all-sockets-filled gate applies to *seating*, not to retention.
 */
export function eject(
  card: Card,
  varName: string,
): { card: Card; chip: Chip; popped: Popped[] } {
  const chip = card.fills[varName];
  if (chip === undefined) {
    throw new Error(`${card.template.label}: socket ${varName} is empty`);
  }

  const fills = { ...card.fills };
  delete fills[varName];

  const keys = [...card.keys];
  const popped: Popped[] = [];
  card.template.locks.forEach((lock, lockIndex) => {
    const key = keys[lockIndex];
    if (key !== null && lock.includes(varName)) {
      popped.push({ lockIndex, chip: key });
      keys[lockIndex] = null;
    }
  });

  return { card: { ...card, fills, keys }, chip, popped };
}

/**
 * Pull a key out of a lock. Nothing pops: a key is substituted into nothing, so
 * removing one changes no picture.
 *
 * Not among DESIGN.md's named operations, and here for the reason the seat verbs
 * are: the interaction lifts any seated chip, and a key is a seated chip.
 */
export function ejectKey(card: Card, index: number): { card: Card; chip: Chip } {
  const chip = card.keys[index];
  if (chip === undefined || chip === null) {
    throw new Error(`${card.template.label}: lock ${index} has no key`);
  }
  const keys = [...card.keys];
  keys[index] = null;
  return { card: { ...card, keys }, chip };
}

