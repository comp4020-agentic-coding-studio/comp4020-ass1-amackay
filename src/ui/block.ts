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

/** What a slot holds, empty or full. */
function slotBox(): HTMLElement {
  const element = document.createElement("span");
  element.className = "slot";
  return element;
}

/**
 * A socket row: the typecode the row expects, and a placeholder for whatever
 * will satisfy it.
 *
 * **The block stops after the typecode.** That is the whole statement the shape
 * makes: a socket will take any expression of its type, so the only part of it
 * the block can honestly claim is the type itself — which is also the only part a
 * chip has to match. The variable's name hangs past that edge, outside the block,
 * on the tint its tokens will carry once it is substituted. It says which socket
 * this is without pretending to be a requirement.
 *
 * Contrast a lock row, where the block wraps the entire statement, because there
 * every token has to match.
 */
function socketRow(card: Card, socket: Socket, variables: ReadonlySet<string>): HTMLElement {
  const element = row("socket");
  element.dataset["var"] = socket.var;

  const slot = slotPath({ cardId: card.id, kind: "socket", var: socket.var });
  const box = slotBox();
  element.append(box);

  const fill = card.fills[socket.var];
  if (fill) {
    const seated = chipRow(fill, variables, "fill");
    seated.dataset["seated"] = slot;
    box.append(seated);
    return element;
  }

  // The row, not the box, is the drop target: the slot's padding then counts as
  // part of it rather than as a dead band above every slot.
  element.dataset["slot"] = slot;
  box.append(typecodeCell(socket.typecode));

  // Absolutely positioned, so it adds nothing to the row's width — which is what
  // lets the block's edge stop at the typecode while this still draws past it.
  const notch = document.createElement("span");
  notch.className = "notch";
  const name = document.createElement("span");
  name.className = "token token--var";
  name.dataset["var"] = socket.var;
  name.dataset["token"] = socket.var;
  name.textContent = glyph(socket.var);
  notch.append(name);
  box.append(notch);

  return element;
}

/**
 * A lock row: a picture of the statement the card is waiting for, drawn with the
 * same token renderer as everything else, or the key that satisfied it.
 *
 * The whole picture is inside the block, unlike a socket's, because every token
 * of it has to match. The picture is inert while any socket is unfilled — it
 * still contains variables, so there is nothing definite to match against yet —
 * and rewrites live as sockets fill.
 */
function lockRow(card: Card, index: number, variables: ReadonlySet<string>): HTMLElement {
  const element = row("lock");
  const slot = slotPath({ cardId: card.id, kind: "lock", index });
  const key = card.keys[index];

  const box = slotBox();
  element.append(box);

  if (key) {
    const seated = chipRow(key, variables, "key");
    seated.dataset["seated"] = slot;
    box.append(seated);
    return element;
  }

  // Only a live lock is a drop target: while a socket is unfilled the picture
  // still holds variables, so there is nothing definite to match against.
  const live = socketsFilled(card);
  element.classList.add(live ? "row--live" : "row--inert");
  if (live) element.dataset["slot"] = slot;

  const inner = document.createElement("span");
  inner.className = "picture-row";
  inner.append(
    ...statementCells(spans(card.template.locks[index], expansion(card.fills)), variables),
  );
  box.append(inner);

  return element;
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
 *
 * The slot padding is CSS padding *on the row*, which is not a detail: it keeps
 * the row boxes tiling with no gaps between them and every one of them starting
 * at x = 0, so `outlinePath` still gets the staircase it is written for while the
 * content inside moves. A grid gap or a row margin would look identical and
 * would break the outline.
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
      for (const socket of card.template.sockets) {
        rows.push(socketRow(card, socket, variables));
      }
    }
    card.template.locks.forEach((_, index) => {
      rows.push(lockRow(card, index, variables));
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
