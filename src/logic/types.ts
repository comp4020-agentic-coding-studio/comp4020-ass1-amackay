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

/** A variable slot: `wph $f wff ph $.` seen from the statement that uses it. */
export interface Float {
  var: string;
  typecode: Typecode;
}

/** A `$f` declaration in its own right — a slotless block, i.e. a palette chip. */
export interface Variable extends Float {
  label: string;
}

/** A palette JSON entry: one `$a`/`$p` with its mandatory hypotheses flattened. */
export interface Statement {
  label: string; // e.g. "ax-1"
  floats: Float[]; // in $f order
  essentials: Expression[];
  conclusion: Expression;
}

/**
 * How an Expr was made. Rendered nowhere in M1–M4; it exists so un-collapse and
 * proof export stay possible without a model change.
 *
 * `fills` is a Record and not a Map on purpose: this is the exportable record,
 * and a Record tree survives JSON.stringify where a Map silently becomes `{}`.
 * The Map lives on BlockInstance, which is working state.
 *
 * A variable chip is a slotless block — `{ label: "wph", fills: {}, locks: [] }`
 * — so there is one shape here, not two.
 */
export interface Provenance {
  label: string;
  fills: Record<string, Provenance>;
  locks: (Provenance | null)[];
}

/** A droppable piece: what it reads as, and how it came to be. */
export interface Expr {
  tokens: Expression;
  provenance: Provenance;
}

/** A block on the bench: a statement plus what has been dropped into it. */
export interface BlockInstance {
  statement: Statement;
  fills: Map<string, Expr>; // float var → substituted expr
  locks: (Provenance | null)[]; // which derived stmt satisfied each essential
  id: string;
}

/** The contents of `public/palettes/<name>.json`, once validated. */
export interface Palette {
  variables: Variable[];
  statements: Statement[];
}
