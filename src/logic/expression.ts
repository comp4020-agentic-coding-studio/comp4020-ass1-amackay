import type { Expr, Expression } from "./types";

/**
 * Substitute `fills` through `tokens` and return the result.
 *
 * Metamath substitution is *simultaneous*, so this is one pass over the source
 * tokens and not repeated single-variable splices. On ax-1, `ph := ps` with
 * `ps := ph` gives `( ps -> ( ph -> ps ) )`; splicing one variable at a time
 * gives `( ph -> ( ph -> ph ) )`, because the second pass eats what the first
 * wrote. `fills` is read and never written, which is what makes that true.
 *
 * A fill contributes `tokens.slice(1)` — everything after its typecode.
 * Splicing a wff in whole would strand its `wff` token mid-statement. The
 * slice is also why the empty wff (`["wff"]`, which MIU declares as `we`)
 * substitutes to nothing at all, which is legal and meaningful.
 *
 * The leading typecode of `tokens` needs no special case: Metamath forbids a
 * symbol being both a constant and a variable, so a typecode is never a float
 * name and always copies through.
 */
export function instantiate(
  tokens: Expression,
  fills: ReadonlyMap<string, Expr>,
): Expression {
  const out: Expression = [];
  for (const token of tokens) {
    const fill = fills.get(token);
    if (fill) {
      for (let i = 1; i < fill.tokens.length; i++) out.push(fill.tokens[i]);
    } else {
      out.push(token);
    }
  }
  return out;
}

/**
 * Exact equality, which is the whole of Metamath's essential-hypothesis check.
 * Nothing cleverer: this literalness is the point of the prototype.
 *
 * Safe as a join because `assertPalette` rejects any token containing
 * whitespace, so no two distinct token arrays can join to the same string.
 */
export function same(a: Expression, b: Expression): boolean {
  return a.join(" ") === b.join(" ");
}
