// The tray's inner edge is a handle: the palette's size is the visitor's, not
// the design's. A wide statement is a reason to widen the drawer, not a reason
// to read it wrapped.
//
// It writes one custom property and stops there. `--tray-w` is what the tray's
// width and the bench's placement inset are both drawn from, so setting it
// resizes both at once, and the ResizeObserver already watching the bench does
// the rest — nothing here knows about cards, caps or clamping.

/** Below this the tray is a band across the top, and the handle runs along it. */
const NARROW = "(width < 760px)";

/** Small enough to be worth the gesture; big enough to still leave a canvas. */
const MIN = 200;
const MAX_SHARE = 0.6;

/** One arrow key press, in pixels. */
const STEP = 16;

function clampSize(size: number, extent: number): number {
  return Math.round(Math.min(Math.max(size, MIN), extent * MAX_SHARE));
}

export function installTray(root: ParentNode): void {
  const handle = root.querySelector<HTMLElement>("[data-tray-handle]");
  const tray = root.querySelector<HTMLElement>("[data-palette]");
  if (!handle || !tray) return;

  /**
   * Vertical while the tray is a left drawer; horizontal once it is a band.
   *
   * Optional call because jsdom has no `matchMedia`, and the spec suite drives
   * this page under jsdom — where there is no layout to have an orientation, so
   * assuming the drawer is right and mounting is what matters.
   */
  const vertical = (): boolean => window.matchMedia?.(NARROW).matches !== true;

  const apply = (size: number): void => {
    const across = vertical();
    const extent = across ? window.innerWidth : window.innerHeight;
    const next = clampSize(size, extent);
    document.documentElement.style.setProperty(across ? "--tray-w" : "--tray-h", `${next}px`);
    handle.setAttribute("aria-orientation", across ? "vertical" : "horizontal");
    handle.setAttribute("aria-valuenow", String(next));
    handle.setAttribute("aria-valuemin", String(MIN));
    handle.setAttribute("aria-valuemax", String(Math.round(extent * MAX_SHARE)));
  };

  /** How big the tray is right now, measured rather than remembered. */
  const size = (): number => {
    const rect = tray.getBoundingClientRect();
    return vertical() ? rect.width : rect.height;
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    // Otherwise the gesture selects text on its way across the page, and on
    // touch it scrolls the tray instead of dragging its edge.
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent): void => {
      const rect = tray.getBoundingClientRect();
      apply(vertical() ? move.clientX - rect.left : move.clientY - rect.top);
    };
    const onUp = (): void => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  });

  // The same resize from the keyboard: the axis the handle lies on, whichever
  // one that currently is.
  handle.addEventListener("keydown", (event) => {
    const keys = vertical() ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    const direction = keys.indexOf(event.key);
    if (direction < 0) return;
    event.preventDefault();
    apply(size() + (direction === 0 ? -STEP : STEP));
  });

  // A window resize can leave the tray over its share of a now-smaller viewport.
  window.addEventListener("resize", () => apply(size()));

  apply(size());
}
