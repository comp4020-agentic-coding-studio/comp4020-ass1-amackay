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

/** set.mm's own values, exactly as extracted. */
export const ALTHTMLDEF: Readonly<Record<string, string>> = parse(raw);

/**
 * Mathematical Alphanumeric Symbols: `ph` is U+1D711 MATHEMATICAL ITALIC SMALL
 * PHI, not Greek phi. 383 of set.mm's definitions use this block.
 */
const MATH_ALPHANUMERIC = /[\u{1D400}-\u{1D7FF}]/gu;

/**
 * Fold those to the letters they decompose to — `𝜑` to `φ`, `𝐴` to `A`.
 *
 * Not a tidy-up: it is the difference between a page that renders the same
 * everywhere and one that does not. Almost no font covers that block, so a
 * browser resolves each of those characters against whatever face it can find,
 * one glyph at a time — which is why the variables arrived in a different style
 * from the operators beside them, differently on each machine. The letters they
 * fold to are in every general-purpose font there is.
 *
 * What it costs: set.mm encodes "this is a variable" in the codepoint, and the
 * fold spends that. The renderer says it in CSS instead, italicising the tokens
 * the palette declares as variables. Across the whole table that is a worse
 * trade than it sounds — 29 token pairs become indistinguishable, `th`/`theta`
 * among them — but none of them are in the propositional fragment either
 * shipped palette uses, and `notation.test.ts` holds that line.
 * `scripts/notation-collisions.py` is where the 29 comes from.
 */
function plain(rendered: string): string {
  return rendered.replace(MATH_ALPHANUMERIC, (character) => character.normalize("NFKD"));
}

const RENDERED: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ALTHTMLDEF).map(([token, rendered]) => [token, plain(rendered)]),
);

/**
 * The glyph for a token, or the token itself.
 *
 * The fallback is deliberate: a palette carrying a token set.mm never defined
 * still renders, in the notation the database uses, rather than vanishing.
 */
export function glyph(token: Token): string {
  return RENDERED[token] ?? token;
}
