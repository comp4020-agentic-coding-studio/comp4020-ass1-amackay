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

const allSocketsFilled = (card: Card): boolean =>
  card.template.sockets.every((s) => card.fills[s.var] !== undefined);

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
  if (!allSocketsFilled(card)) return false;
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
  return allSocketsFilled(card) && card.keys.every((key) => key !== null);
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

