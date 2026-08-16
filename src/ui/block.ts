import {
  conclusionTokens,
  socketsFilled,
  type Card,
  type Chip,
  type Expression,
  type Socket,
  type Token,
} from "../logic";
import { createOutline, observeOutline } from "./outline";
import { spans, statementCells, typecodeCell } from "./tokens";

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

  const fill = card.fills[socket.var];
  if (fill) {
    element.append(chipRow(fill, variables, "fill"));
  } else {
    const notch = document.createElement("span");
    notch.className = "notch";
    notch.textContent = socket.var;
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
  const key = card.keys[index];

  if (key) {
    element.append(chipRow(key, variables, "key"));
    return { element, dispose: () => {} };
  }

  element.classList.add(socketsFilled(card) ? "row--live" : "row--inert");

  const picture = document.createElement("span");
  picture.className = "picture";
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

function conclusionRow(card: Card, variables: ReadonlySet<string>): HTMLElement {
  const element = row("conclusion");
  element.append(
    ...statementCells(spans(card.template.conclusion, expansion(card.fills)), variables),
  );
  return element;
}

/**
 * A card: one row per socket, one per lock, then the conclusion. Each row is
 * shrink-to-fit, so the silhouette is a staircase that changes as slots fill —
 * and a collapsed card is the conclusion row alone, which still wraps.
 */
export function renderCard(card: Card, variables: ReadonlySet<string>): Rendered {
  const element = document.createElement("div");
  element.className = "block";
  element.dataset["card"] = card.id;
  if (card.collapsed) element.classList.add("block--collapsed");

  const { svg, path } = createOutline();
  const rows: HTMLElement[] = [];
  const disposers: (() => void)[] = [];

  if (!card.collapsed) {
    for (const socket of card.template.sockets) rows.push(socketRow(card, socket, variables));
    card.template.locks.forEach((_, index) => {
      const lock = lockRow(card, index, variables);
      rows.push(lock.element);
      disposers.push(lock.dispose);
    });
  }
  rows.push(conclusionRow(card, variables));

  element.append(svg, ...rows);
  disposers.push(observeOutline(path, rows));

  return {
    element,
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  };
}
