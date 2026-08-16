// The keyboard half of the interaction.
//
// The design study built a tap-to-lift / tap-to-drop "carry" mode alongside
// drag, and drag won. This is that mode returning as the keyboard path: the
// same workspace transitions, a different event→transition mapping, and no
// second idea about what any of it means.
//
// Enter on a palette entry places a copy — DESIGN's literal "focus a chip, Enter
// lifts" would leave a keyboard user unable to get a `wi` card onto the bench at
// all, and the whole derivation would be pointer-only. From the bench, Enter on
// a chip lifts, Tab cycles the legal slots, Enter seats, Escape cancels.

import type { Template } from "../logic";
import { parseSlot, type SlotRef, type Workspace } from "./workspace";

export interface KeyboardContext {
  workspace: Workspace;
  entries: Template[];
  benchCards: HTMLElement;
  render: () => void;
  onSeat: (ref: SlotRef, completed: boolean) => void;
  /** Render state both adapters steer. */
  ui: { focusId: string | null; target: SlotRef | null };
}

const ACTIVATE = new Set(["Enter", " "]);

/** Where a keyboard-placed card lands: a short cascade, so they do not stack. */
function cascade(count: number): { x: number; y: number } {
  return { x: 16 + (count % 5) * 26, y: 40 + (count % 5) * 30 };
}

export function installKeyboard(context: KeyboardContext): void {
  const { workspace, ui } = context;

  /** Move the target cursor along the legal slots, wrapping at both ends. */
  function step(by: number): void {
    const legal = workspace.legalSlots();
    if (legal.length === 0) return;
    const at = legal.findIndex(
      (slot) => ui.target && slotEquals(slot, ui.target),
    );
    const next = (at + by + legal.length * 2) % legal.length;
    ui.target = legal[at === -1 ? 0 : next];
    context.render();
  }

  function whileCarrying(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      workspace.cancel();
      ui.target = null;
      context.render();
      return;
    }

    if (ACTIVATE.has(event.key) && ui.target) {
      event.preventDefault();
      const ref = ui.target;
      const seated = workspace.seat(ref);
      ui.target = null;
      if (seated) context.onSeat(ref, seated.completed);
      else context.render();
    }
  }

  function whileIdle(event: KeyboardEvent): void {
    if (!ACTIVATE.has(event.key)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const entry = target.closest<HTMLElement>("[data-palette-index]");
    if (entry) {
      event.preventDefault();
      const template = context.entries[Number(entry.dataset["paletteIndex"])];
      if (!template) return;
      const { x, y } = cascade(workspace.cards.length);
      const placed = workspace.add(workspace.mint(template, x, y), x, y);
      ui.focusId = placed.id;
      context.render();
      return;
    }

    // A seated chip goes straight back onto the bench: eject is one gesture,
    // not a carry looking for somewhere to land.
    const seated = target.closest<HTMLElement>("[data-seated]");
    if (seated) {
      const ref = parseSlot(seated.dataset["seated"] ?? "");
      if (!ref) return;
      event.preventDefault();
      const carry =
        ref.kind === "socket"
          ? workspace.liftFromSocket(ref.cardId, ref.var)
          : workspace.liftFromLock(ref.cardId, ref.index);
      if (!carry) return;
      const host = workspace.find(ref.cardId);
      const placed = workspace.place((host?.x ?? 0) + 24, (host?.y ?? 0) + 24);
      ui.focusId = placed?.id ?? null;
      context.render();
      return;
    }

    const block = target.closest<HTMLElement>("[data-card]");
    if (!block || !context.benchCards.contains(block)) return;

    event.preventDefault();
    const carry = workspace.liftCard(block.dataset["card"] ?? "");
    if (!carry) return;
    if (!carry.seatable) {
      // Nothing to aim at: put it straight back rather than stranding it.
      workspace.cancel();
      context.render();
      return;
    }
    ui.target = workspace.legalSlots()[0] ?? null;
    context.render();
  }

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (workspace.carry) whileCarrying(event);
    else whileIdle(event);
  });
}

function slotEquals(a: SlotRef, b: SlotRef): boolean {
  if (a.cardId !== b.cardId || a.kind !== b.kind) return false;
  return a.kind === "socket" ? a.var === (b as typeof a).var : a.index === (b as typeof a).index;
}
