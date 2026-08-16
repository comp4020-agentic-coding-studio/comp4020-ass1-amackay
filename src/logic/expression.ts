import type { Expression, Token } from "./types";

/**
 * Rewrite `tokens`, replacing each token `expand` has an expansion for.
 *
 * Metamath substitution is *simultaneous*, so this is one pass over the source
 * tokens and not repeated single-token splices. On ax-1, `ph := ps` with
 * `ps := ph` gives `( ps -> ( ph -> ps ) )`; splicing one variable at a time
 * gives `( ph -> ( ph -> ph ) )`, because the second pass eats what the first
 * wrote. Reading the source and never the output is what makes that true.
 *
 * An expansion is a whole expression and contributes `slice(1)` — everything
 * after its typecode. Splicing a wff in whole would strand its `wff` token
 * mid-statement. The slice is also why the empty wff (`["wff"]`, which MIU
 * declares as `we`) substitutes to nothing at all, which is legal and meaningful.
 *
 * `expand` is a callback rather than a map of fills because the expansion of a
 * chip is itself computed by substitution: taking a lookup keeps this module
 * ignorant of chips, so `chip.ts` can recurse into it without a cycle.
 *
 * The leading typecode of `tokens` needs no special case: Metamath forbids a
 * symbol being both a constant and a variable, so a typecode is never a socket
 * variable and always copies through.
 */
export function substitute(
  tokens: Expression,
  expand: (token: Token) => Expression | undefined,
): Expression {
  const out: Expression = [];
  for (const token of tokens) {
    const expansion = expand(token);
    if (expansion) {
      for (let i = 1; i < expansion.length; i++) out.push(expansion[i]);
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
