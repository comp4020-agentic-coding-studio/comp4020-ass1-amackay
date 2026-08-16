// The core model, transcribed from DESIGN.md. Types only — no values, no logic,
// and (like everything under src/logic) no DOM.
//
// One representation throughout: an expression is a token array whose first
// token is its typecode. That makes palette JSON a literal transcription of
// set.mm (`wph $f wff ph $.` is `["wff", "ph"]`), and makes the lock check one
// comparison rather than one across two shapes — which is how an "exact
// equality" check quietly starts passing near-misses.

export type Token = string; // "(", "ph", "->", ...
export type Typecode = "wff" | "setvar" | "class" | "|-";
export type Expression = Token[]; // tokens[0] is always the typecode

export const TYPECODES: readonly Typecode[] = ["wff", "setvar", "class", "|-"];

/** A floating-hypothesis slot: `wph $f wff ph $.` seen from the template using it. */
export interface Socket {
  var: string;
  typecode: Typecode;
}

/** A `$f` declaration in its own right — the palette's variable chips. */
export interface Variable extends Socket {
  label: string;
}

/** A palette JSON entry: one `$a`/`$p` with its mandatory hypotheses flattened. */
export interface Template {
  label: string; // e.g. "ax-1"
  sockets: Socket[]; // MM floating hypotheses, $f order
  locks: Expression[]; // MM essential hypotheses
  conclusion: Expression;
}

/**
 * A complete derivation, collapsed to its conclusion — the only thing that can
 * occupy a socket or a lock. Immutable.
 *
 * A chip *is* the provenance: there is no parallel proof record to keep in step
 * with the tokens, because the tokens are recomputed from this structure by
 * `conclusionTokens`. Nothing here is a Map, so the whole tree survives
 * `JSON.stringify` and proof export stays possible without a model change.
 *
 * The invariant the rest of the layer leans on: every socket of `template` has a
 * fill and every lock has a key, recursively. `freeze` is the only way to make
 * one, and it will not make one from an incomplete card.
 */
export interface Chip {
  template: Template;
  fills: Record<string, Chip>; // one per socket
  keys: Chip[]; // one per lock, in lock order
}

/** Where the UI is putting a card. Supplied by the caller; this layer mints no ids. */
export interface Placement {
  id: string;
  x: number;
  y: number;
  z: number;
}

/** A block instance on the bench: the only mutable thing in the model. */
export interface Card {
  id: string;
  template: Template;
  fills: Partial<Record<string, Chip>>;
  keys: (Chip | null)[];
  // UI state. It lives here because a card is what the bench draws, but nothing
  // in this layer reads it.
  collapsed: boolean;
  x: number;
  y: number;
  z: number;
}

/** The contents of `src/palettes/<name>.json`, once validated. */
export interface Palette {
  variables: Variable[];
  templates: Template[];
}
