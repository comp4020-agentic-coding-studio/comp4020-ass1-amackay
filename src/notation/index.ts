// How a token is *written*, as against what it is.
//
// set.mm carries its own answer in the `$( $t … $)` typesetting block at the end
// of the file: an `althtmldef` per token, mapping it to an HTML fragment whose
// text is the Unicode glyph. `scripts/extract-notation.py` turns those into the
// JSON beside this file.
//
// Rendering only. Nothing in `src/logic` knows this module exists: substitution
// and the lock's exact-equality check work on the ASCII tokens the database
// stores, and a glyph is a fact about display. Keeping that line means a
// statement can look like mathematics without the model ever agreeing that
// `𝜑` and `ph` are two different things.

import raw from "./althtmldef.json?raw";
import type { Token } from "../logic";

function parse(json: string): Record<string, string> {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("althtmldef.json: must be an object of token to glyph");
  }
  for (const [token, rendered] of Object.entries(value)) {
    if (typeof rendered !== "string" || rendered === "") {
      throw new Error(`althtmldef.json: ${token} has no glyph`);
    }
  }
  // A truncated or half-written table would otherwise show up as a page that
  // quietly renders in ASCII, which is exactly the failure hardest to notice.
  const table = value as Record<string, string>;
  if (Object.keys(table).length === 0) throw new Error("althtmldef.json: is empty");
  return table;
}

export const ALTHTMLDEF: Readonly<Record<string, string>> = parse(raw);

/**
 * The glyph for a token, or the token itself.
 *
 * The fallback is deliberate: a palette carrying a token set.mm never defined
 * still renders, in the notation the database uses, rather than vanishing.
 */
export function glyph(token: Token): string {
  return ALTHTMLDEF[token] ?? token;
}
