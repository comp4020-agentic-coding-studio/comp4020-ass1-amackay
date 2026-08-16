// The pointer half of the interaction: where the pointer is, what is under it,
// and what the carried piece looks like while it is in the air.
//
// Every decision about *what happens* belongs to workspace.ts. This file asks
// it questions and tells it about gestures; it never works out legality itself.

import type { Card, Template } from "../logic";
import { clamp, parseSlot, type Carry, type SlotRef, type Workspace } from "./workspace";

/** Which gesture a pointerdown started, worked out from what it landed on. */
export type Grab =
  | { kind: "palette"; index: number }
  | { kind: "card"; id: string }
  | { kind: "seated"; slot: SlotRef };

export interface DragContext {
  workspace: Workspace;
  /** The palette, in the order the DOM lists it. */
  entries: Template[];
  benchCards: HTMLElement;
  /** Rebuild the bench from workspace state, highlighting any legal targets. */
  render: () => void;
  /** The carried card as a detached block, for the ghost. */
  renderGhost: (card: Card) => HTMLElement;
  /** A seat landed; the caller sequences the flash and the collapse. */
  onSeat: (ref: SlotRef, completed: boolean) => void;
}

/** Start the gesture the grab describes. Which lift it is, the workspace decides. */
export function lift(context: DragContext, grab: Grab): Carry | null {
  const { workspace, entries } = context;
  if (grab.kind === "palette") {
    const template = entries[grab.index];
    return template ? workspace.liftFromPalette(template) : null;
  }
  if (grab.kind === "card") return workspace.liftCard(grab.id);
  return grab.slot.kind === "socket"
    ? workspace.liftFromSocket(grab.slot.cardId, grab.slot.var)
    : workspace.liftFromLock(grab.slot.cardId, grab.slot.index);
}

/**
 * Read a pointerdown target and say what it means.
 *
 * Hit-testing is by DOM containment and never by geometry: a seated chip is
 * inside its host card, so the innermost match has to win or grabbing a chip
 * would drag the card holding it.
 */
export function grabFrom(target: Element): Grab | null {
  const seated = target.closest<HTMLElement>("[data-seated]");
  if (seated) {
    const slot = parseSlot(seated.dataset["seated"] ?? "");
    return slot ? { kind: "seated", slot } : null;
  }

  const block = target.closest<HTMLElement>("[data-card]");
  if (!block) return null;

  const paletteIndex = block.dataset["paletteIndex"];
  if (paletteIndex !== undefined) return { kind: "palette", index: Number(paletteIndex) };
  return { kind: "card", id: block.dataset["card"] ?? "" };
}

/**
 * Resolve a release, in the order DESIGN.md fixes: a legal slot, then the delete
 * target, then the bench, then nothing.
 *
 * An *illegal* slot deliberately falls through to the bench branch rather than
 * bouncing back — the piece lands on the canvas where it was dropped.
 */
export type Landing =
  | { kind: "seat"; ref: SlotRef }
  | { kind: "delete" }
  | { kind: "bench" }
  | { kind: "away" };

export function landingAt(
  workspace: Workspace,
  element: Element | null,
): Landing {
  if (!element) return { kind: "away" };

  const slotEl = element.closest<HTMLElement>("[data-slot]");
  if (slotEl) {
    const ref = parseSlot(slotEl.dataset["slot"] ?? "");
    if (ref && workspace.canSeat(ref)) return { kind: "seat", ref };
  }

  if (element.closest("[data-delete]")) return { kind: "delete" };
  if (element.closest("[data-bench-cards]")) return { kind: "bench" };
  return { kind: "away" };
}

/**
 * Wire the pointer to the workspace.
 *
 * `pointermove`, `pointerup` and `keydown` go on `window`, not on the block: the
 * pointer routinely leaves the block it started on, and a release outside the
 * bench is a real gesture (it deletes) rather than a lost one.
 */
export function installDrag(context: DragContext): void {
  const { workspace } = context;
  let ghost: HTMLElement | null = null;
  let grabX = 0;
  let grabY = 0;

  const moveGhost = (clientX: number, clientY: number): void => {
    ghost?.style.setProperty("transform", `translate(${clientX - grabX}px, ${clientY - grabY}px)`);
  };

  const finish = (): void => {
    ghost?.remove();
    ghost = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey, true);
    context.render();
  };

  function onMove(event: PointerEvent): void {
    moveGhost(event.clientX, event.clientY);
  }

  /** Where the carried card's top-left should land, in bench coordinates. */
  function benchPoint(clientX: number, clientY: number): { x: number; y: number } {
    const bench = context.benchCards;
    const rect = bench.getBoundingClientRect();
    const size = ghost?.getBoundingClientRect() ?? { width: 0, height: 0 };
    return clamp(
      clientX - rect.left - grabX + bench.scrollLeft,
      clientY - rect.top - grabY + bench.scrollTop,
      { w: size.width, h: size.height },
      { w: bench.clientWidth, h: bench.clientHeight },
    );
  }

  function onUp(event: PointerEvent): void {
    // The ghost is pointer-events: none, so this is what is *under* it.
    const landing = landingAt(workspace, document.elementFromPoint(event.clientX, event.clientY));

    if (landing.kind === "seat") {
      const seated = workspace.seat(landing.ref);
      finish();
      if (seated) context.onSeat(landing.ref, seated.completed);
      return;
    }

    if (landing.kind === "bench") {
      const { x, y } = benchPoint(event.clientX, event.clientY);
      workspace.place(x, y);
    } else {
      // Released on the delete target, or clean off the bench. Both discard.
      workspace.discard();
    }
    finish();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    workspace.cancel();
    finish();
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    // Cannot happen through the pointer — a drag ends on pointerup — but guard
    // anyway, and ignore the second lift rather than swapping what is carried.
    if (workspace.carry) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-collapse-toggle]")) return; // the toggle is not a lift

    const grab = grabFrom(target);
    if (!grab) return;

    // The rect of the thing actually grabbed, so the piece never jumps under
    // the cursor: a seated chip is measured as the chip, not as its host.
    const grabbed = target.closest<HTMLElement>("[data-seated], [data-card]");
    if (!grabbed) return;
    const rect = grabbed.getBoundingClientRect();

    const carry = lift(context, grab);
    if (!carry) return;

    event.preventDefault();
    event.stopPropagation();
    grabX = event.clientX - rect.left;
    grabY = event.clientY - rect.top;

    context.render();

    ghost = context.renderGhost(carry.card);
    ghost.classList.add("ghost");
    document.body.append(ghost);
    moveGhost(event.clientX, event.clientY);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
  });
}
