import { createCard, parsePalette, variableTemplate, type Palette, type Template } from "../logic";
import prototypeJson from "../palettes/prototype.json?raw";
import { renderCard } from "./block";
import { scene } from "./scene";

// Imported as text, not fetched. `public/` can only be fetched, and a fetch
// makes page init async — which the spec suite cannot drive under jsdom, where
// a relative URL resolves against nothing. `parsePalette` still validates the
// exact bytes that ship, so the validator stays a sensor rather than a comment.
export const palette: Palette = parsePalette(prototypeJson, "prototype.json");

/** Every variable the palette declares, for the renderer's identity colours. */
export const variables: ReadonlySet<string> = new Set(palette.variables.map((v) => v.var));

/** Find a mount point, or say which one is missing. */
function region(root: ParentNode, attribute: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[${attribute}]`);
  if (!element) throw new Error(`the page has no [${attribute}] to render into`);
  return element;
}

/**
 * Everything the palette offers, in one list: the variable chips first, then the
 * templates. A variable chip is a slotless template, so both are empty cards and
 * both go through the same renderer — there is no second kind of block.
 */
const entries = (): Template[] => [
  ...palette.variables.map(variableTemplate),
  ...palette.templates,
];

/** The widest a card may be: the design's cap, or the bench, whichever is less. */
const DESIGN_CAP = 560;
const BENCH_GUTTER = 26;

/**
 * Cap blocks against the **bench**, never the viewport. `78vw` was the obvious
 * answer and the wrong one: a 520px block "fits" 78vw while overflowing a 380px
 * bench, because the bench is one flex item inside a padded page and not the
 * window. Measuring the thing blocks actually sit in is the only cap that holds
 * at every width.
 */
function capBlocks(bench: HTMLElement): () => void {
  const apply = (): void => {
    const cap = Math.min(DESIGN_CAP, bench.clientWidth - BENCH_GUTTER);
    bench.style.setProperty("--block-max-w", `${Math.max(cap, 0)}px`);
  };

  apply();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(apply);
  observer.observe(bench);
  return () => observer.disconnect();
}

export function mount(root: ParentNode): void {
  const paletteBlocks = region(root, "data-palette-blocks");
  const benchCards = region(root, "data-bench-cards");

  paletteBlocks.replaceChildren(
    ...entries().map(
      (template, i) =>
        renderCard(createCard(template, { id: `p${i}`, x: 0, y: 0, z: 0 }), variables).element,
    ),
  );

  capBlocks(benchCards);

  // Cards sit where they were put, and stack in the order they were put there.
  benchCards.replaceChildren(
    ...scene(palette).map((card) => {
      const { element } = renderCard(card, variables);
      element.style.left = `${card.x}px`;
      element.style.top = `${card.y}px`;
      element.style.zIndex = String(card.z);
      return element;
    }),
  );
}
