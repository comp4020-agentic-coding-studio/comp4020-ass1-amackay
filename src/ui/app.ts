import { parsePalette, variableTemplate, type Card, type Palette, type Template } from "../logic";
import prototypeJson from "../palettes/prototype.json?raw";
import { renderCard } from "./block";
import { installDrag } from "./drag";
import { installKeyboard } from "./keyboard";
import { installTray } from "./tray";
import { slotPath, Workspace, type SlotRef } from "./workspace";

// Imported as text, not fetched. `public/` can only be fetched, and a fetch
// makes page init async — which the spec suite cannot drive under jsdom, where
// a relative URL resolves against nothing. `parsePalette` still validates the
// exact bytes that ship, so the validator stays a sensor rather than a comment.
export const palette: Palette = parsePalette(prototypeJson, "prototype.json");

/** Every variable the palette declares, for the renderer's identity colours. */
export const variables: ReadonlySet<string> = new Set(palette.variables.map((v) => v.var));

/**
 * Everything the palette offers, in one list: the variable chips first, then the
 * templates. A variable chip is a slotless template, so both are empty cards and
 * both go through the same renderer — there is no second kind of block.
 */
export const entries: Template[] = [
  ...palette.variables.map(variableTemplate),
  ...palette.templates,
];

/** Find a mount point, or say which one is missing. */
function region(root: ParentNode, attribute: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[${attribute}]`);
  if (!element) throw new Error(`the page has no [${attribute}] to render into`);
  return element;
}

/** The widest a card may be: the design's cap, or the bench, whichever is less. */
const DESIGN_CAP = 560;
const BENCH_GUTTER = 26;

/** Flash: hold bright for a frame or so, then decay. Matches `--t-token`. */
const FLASH_HOLD = 120;
const FLASH_DECAY = 450;

/**
 * Cap blocks against the **bench**, never the viewport. `78vw` was the obvious
 * answer and the wrong one: a 520px block "fits" 78vw while overflowing a 380px
 * bench, because the bench is one flex item inside a padded page and not the
 * window. Measuring the thing blocks actually sit in is the only cap that holds
 * at every width.
 */
function capBlocks(bench: HTMLElement, onResize: () => void): void {
  const apply = (): void => {
    const cap = Math.min(DESIGN_CAP, bench.clientWidth - BENCH_GUTTER);
    bench.style.setProperty("--block-max-w", `${Math.max(cap, 0)}px`);
    onResize();
  };

  apply();
  if (typeof ResizeObserver === "undefined") return;
  new ResizeObserver(apply).observe(bench);
}

export function mount(root: ParentNode): void {
  const paletteBlocks = region(root, "data-palette-blocks");
  const benchCards = region(root, "data-bench-cards");
  const workspace = new Workspace();

  // The palette never changes, so it is rendered once. Each entry is an empty
  // card of its template, marked with its index so a grab can name it.
  paletteBlocks.replaceChildren(
    ...entries.map((template, index) => {
      const { element } = renderCard(workspace.mint(template, 0, 0), variables, {
        sockets: false,
      });
      element.dataset["paletteIndex"] = String(index);
      element.dataset["coreInteraction"] = "";
      return element;
    }),
  );

  /**
   * Render state the two adapters steer: which card the keyboard comes back to
   * after a rebuild, and which slot its target cursor is on.
   */
  const ui: { focusId: string | null; target: SlotRef | null } = { focusId: null, target: null };
  /** The seat whose spans are currently lit. */
  let flash: SlotRef | null = null;

  const render = (): void => {
    const legal = new Set(workspace.legalSlots().map(slotPath));
    const targeted = ui.target ? slotPath(ui.target) : null;

    benchCards.replaceChildren(
      ...workspace.ordered().map((card) => {
        const { element } = renderCard(card, variables, {
          toggle: true,
          flash: flash?.cardId === card.id ? flash : null,
        });
        element.style.left = `${card.x}px`;
        element.style.top = `${card.y}px`;
        element.style.zIndex = String(card.z);

        // Every legal target lights up together, so the question "where can this
        // go" is answered by looking rather than by trying.
        for (const slot of element.querySelectorAll<HTMLElement>("[data-slot]")) {
          const path = slot.dataset["slot"] ?? "";
          if (legal.has(path)) slot.classList.add("is-legal");
          if (path === targeted) slot.classList.add("is-target");
        }

        // A seated chip is reachable too, because the keyboard has to be able
        // to pull one out as well as put one in.
        for (const seat of element.querySelectorAll<HTMLElement>("[data-seated]")) {
          seat.tabIndex = 0;
        }
        return element;
      }),
    );

    document.body.classList.toggle("is-carrying", workspace.carry !== null);

    // Focus survives the rebuild: the keyboard path depends on landing back on
    // the card it was working with.
    const targetSlot = targeted && benchCards.querySelector<HTMLElement>(`[data-slot="${targeted}"]`);
    if (targetSlot) targetSlot.scrollIntoView({ block: "nearest" });
    else if (ui.focusId) {
      benchCards.querySelector<HTMLElement>(`[data-card="${ui.focusId}"]`)?.focus();
    }
  };

  /**
   * A seat landed. Flash what it rewrote, and only once that has decayed let a
   * completed card collapse — sequenced, never simultaneous, so the visitor sees
   * *what changed* before the card folds up and hides it.
   */
  const onSeat = (ref: SlotRef, completed: boolean): void => {
    ui.focusId = ref.cardId;
    flash = ref;
    render();

    window.setTimeout(() => {
      flash = null;
      // Cleared from the live DOM rather than by re-rendering: a rebuild would
      // replace the spans and restart the transition instead of decaying it.
      for (const lit of benchCards.querySelectorAll(".is-flash")) lit.classList.remove("is-flash");

      if (completed) {
        window.setTimeout(() => {
          workspace.collapse(ref.cardId);
          render();
        }, FLASH_DECAY);
      }
      // A seat makes a card taller. Re-measure once the new DOM has laid out.
      reclamp();
    }, FLASH_HOLD);
  };

  benchCards.addEventListener("click", (event) => {
    const toggle = (event.target as Element | null)?.closest<HTMLElement>("[data-collapse-toggle]");
    if (!toggle) return;
    workspace.toggleCollapsed(toggle.dataset["collapseToggle"] ?? "");
    render();
  });

  installDrag({
    workspace,
    entries,
    benchCards,
    render,
    renderGhost: (card: Card) => renderCard(card, variables).element,
    onSeat,
  });

  installKeyboard({ workspace, entries, benchCards, render, onSeat, ui });
  installTray(root);

  /**
   * A card grows when a run rewraps, so a narrower bench can leave one hanging
   * out of it. Measure what is actually on screen and pull them back — including
   * while a piece is in the air, which is the case that would otherwise strand a
   * card behind the ghost.
   */
  const reclamp = (): void => {
    const moved = workspace.reclamp(
      { w: benchCards.clientWidth, h: benchCards.clientHeight },
      (id) => {
        const element = benchCards.querySelector<HTMLElement>(`[data-card="${id}"]`);
        return element ? { w: element.offsetWidth, h: element.offsetHeight } : null;
      },
    );
    if (moved) render();
  };

  capBlocks(benchCards, reclamp);
  render();
}
