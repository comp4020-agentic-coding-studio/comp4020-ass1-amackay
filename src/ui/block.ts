import {
  conclusionTokens,
  isComplete,
  socketsFilled,
  type Card,
  type Chip,
  type Expression,
  type Socket,
  type Token,
} from "../logic";
import { glyph } from "../notation";
import { createOutline, observeOutline } from "./outline";
import { spans, statementCells, typecodeCell } from "./tokens";
import { slotPath, type SlotRef } from "./workspace";

/** A rendered block and the observers it owns. */
export interface Rendered {
  element: HTMLElement;
  dispose: () => void;
}

/** Substitution under some fills — the same expansion the logic layer performs. */
const expansion =
  (fills: Readonly<Record<string, Chip | undefined>>) =>
  (token: Token): Expression | undefined => {
    const fill = fills[token];
    return fill ? conclusionTokens(fill) : undefined;
  };

function row(modifier: string): HTMLElement {
  const element = document.createElement("div");
  element.className = `row row--${modifier}`;
  return element;
}

/** A chip's conclusion, one row, wherever it is seated. */
function chipRow(chip: Chip, variables: ReadonlySet<string>, modifier: string): HTMLElement {
  const seated = document.createElement("span");
  seated.className = `seated seated--${modifier}`;
  seated.append(...statementCells(spans(chip.template.conclusion, expansion(chip.fills)), variables));
  return seated;
}

/**
 * A socket row: the type the row expects, then either the notch waiting for it
 * or the chip that filled it.
 *
 * The notch is typecode-shaped on purpose. A seated chip leads with its own
 * typecode cell, which is the same shape, so it lands exactly where the notch
 * was — only the typecode part has to fit, and the fit is the thing you see.
 */
function socketRow(card: Card, socket: Socket, variables: ReadonlySet<string>): HTMLElement {
  const element = row("socket");
  element.dataset["var"] = socket.var;
  element.append(typecodeCell(socket.typecode));

  const slot = slotPath({ cardId: card.id, kind: "socket", var: socket.var });
  const fill = card.fills[socket.var];
  if (fill) {
    const seated = chipRow(fill, variables, "fill");
    seated.dataset["seated"] = slot;
    element.append(seated);
  } else {
    const notch = document.createElement("span");
    notch.className = "notch";
    notch.textContent = glyph(socket.var);
    notch.dataset["slot"] = slot;
    element.append(notch);
  }
  return element;
}

/**
 * A lock row: a dashed picture of the statement the card is waiting for, drawn
 * with the same token renderer as everything else, or the key that satisfied it.
 *
 * The picture is inert while any socket is unfilled — it still contains
 * variables, so there is nothing definite to match against yet — and rewrites
 * live as sockets fill.
 */
function lockRow(card: Card, index: number, variables: ReadonlySet<string>): Rendered {
  const element = row("lock");
  const slot = slotPath({ cardId: card.id, kind: "lock", index });
  const key = card.keys[index];

  if (key) {
    const seated = chipRow(key, variables, "key");
    seated.dataset["seated"] = slot;
    element.append(seated);
    return { element, dispose: () => {} };
  }

  // Only a live lock is a drop target: while a socket is unfilled the picture
  // still holds variables, so there is nothing definite to match against.
  const live = socketsFilled(card);
  element.classList.add(live ? "row--live" : "row--inert");

  const picture = document.createElement("span");
  picture.className = "picture";
  if (live) picture.dataset["slot"] = slot;
  const { svg, path } = createOutline("picture");
  const inner = document.createElement("span");
  inner.className = "picture-row";
  inner.append(
    ...statementCells(spans(card.template.locks[index], expansion(card.fills)), variables),
  );
  picture.append(svg, inner);
  element.append(picture);

  return { element, dispose: observeOutline(path, [inner]) };
}

function conclusionRow(
  card: Card,
  variables: ReadonlySet<string>,
  withToggle: boolean,
): HTMLElement {
  const element = row("conclusion");
  const cells = statementCells(spans(card.template.conclusion, expansion(card.fills)), variables);
  element.append(...cells);

  // The caret rides at the end of the run, as one more token-sized flex item:
  // inside the block, never colliding with the staircase outline, and moving
  // with the wrap instead of floating over a corner that keeps changing shape.
  if (withToggle && isComplete(card)) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "collapse-toggle";
    toggle.dataset["collapseToggle"] = card.id;
    toggle.textContent = card.collapsed ? "⌄" : "⌃";
    toggle.setAttribute("aria-label", card.collapsed ? "Expand this derivation" : "Collapse");
    cells[1].append(toggle);
  }
  return element;
}

/**
 * Light the spans a seat just rewrote.
 *
 * Scoped to the conclusion and the lock pictures: a seated chip's own spans
 * carry `data-from` for *its* sockets, and flashing those would light tokens
 * this seat did not touch. All occurrences of the variable go together, which is
 * the point — ax-1's two `ph`s are one substitution, not two.
 */
function markFlash(element: HTMLElement, ref: SlotRef): void {
  if (ref.kind === "lock") {
    element.querySelector(`[data-seated="${slotPath(ref)}"]`)?.classList.add("is-flash");
    return;
  }
  const scoped = `.row--conclusion [data-from="${ref.var}"], .picture-row [data-from="${ref.var}"]`;
  for (const span of element.querySelectorAll(scoped)) span.classList.add("is-flash");
}

/**
 * A card: one row per socket, one per lock, then the conclusion. Each row is
 * shrink-to-fit, so the silhouette is a staircase that changes as slots fill —
 * and a collapsed card is the conclusion row alone, which still wraps.
 */
export interface RenderOptions {
  /** The seat that just happened, whose spans should flash. */
  flash?: SlotRef | null;
  /** Whether this card can be expanded and re-collapsed — bench cards only. */
  toggle?: boolean;
  /**
   * Whether to draw the socket rows. The palette turns them off: its blocks are
   * a menu of what each template *says*, and an empty notch there is a slot
   * nothing can be dropped into — a palette card is not on the bench, so it has
   * no fills to show. They appear the moment a copy lands on the bench.
   */
  sockets?: boolean;
}

export function renderCard(
  card: Card,
  variables: ReadonlySet<string>,
  options: RenderOptions = {},
): Rendered {
  const element = document.createElement("div");
  element.className = "block";
  element.dataset["card"] = card.id;
  // Reachable by tab, because the keyboard has to be able to lift what the
  // pointer can. `touch-action: none` (in CSS) keeps a touch drag from
  // scrolling the page out from under itself.
  element.tabIndex = 0;
  if (card.collapsed) element.classList.add("block--collapsed");

  const { svg, path } = createOutline();
  const rows: HTMLElement[] = [];
  const disposers: (() => void)[] = [];

  if (!card.collapsed) {
    if (options.sockets ?? true) {
      for (const socket of card.template.sockets) rows.push(socketRow(card, socket, variables));
    }
    card.template.locks.forEach((_, index) => {
      const lock = lockRow(card, index, variables);
      rows.push(lock.element);
      disposers.push(lock.dispose);
    });
  }
  rows.push(conclusionRow(card, variables, options.toggle ?? false));

  element.append(svg, ...rows);
  if (options.flash) markFlash(element, options.flash);
  disposers.push(observeOutline(path, rows));

  return {
    element,
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  };
}
