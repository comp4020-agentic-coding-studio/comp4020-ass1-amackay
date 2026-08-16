import { parsePalette, type Palette } from "../logic";
import prototypeJson from "../palettes/prototype.json?raw";

// Imported as text, not fetched. `public/` can only be fetched, and a fetch
// makes page init async — which the spec suite cannot drive under jsdom, where
// a relative URL resolves against nothing. `parsePalette` still validates the
// exact bytes that ship, so the validator stays a sensor rather than a comment.
export const palette: Palette = parsePalette(prototypeJson, "prototype.json");

/** Find a mount point, or say which one is missing. */
function region(root: ParentNode, attribute: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[${attribute}]`);
  if (!element) throw new Error(`the page has no [${attribute}] to render into`);
  return element;
}

export function mount(root: ParentNode): void {
  const paletteBlocks = region(root, "data-palette-blocks");
  const benchCards = region(root, "data-bench-cards");

  paletteBlocks.replaceChildren(
    ...palette.templates.map((template) => {
      const block = document.createElement("div");
      block.className = "block";
      block.textContent = template.label;
      return block;
    }),
  );

  benchCards.replaceChildren();
}
