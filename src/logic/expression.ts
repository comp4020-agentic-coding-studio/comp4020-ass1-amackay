import type { Expr, Expression } from "./types";

const NOT_IMPLEMENTED = "M1: not implemented";

/**
 * Substitute `fills` through `tokens` and return the result.
 *
 * Metamath substitution is *simultaneous*, so this is one pass and not repeated
 * single-variable splices. On ax-1, `ph := ps` with `ps := ph` gives
 * `( ps -> ( ph -> ps ) )`; splicing one variable at a time gives
 * `( ph -> ( ph -> ph ) )`, because the second pass eats what the first wrote.
 */
export function instantiate(
  tokens: Expression,
  fills: ReadonlyMap<string, Expr>,
): Expression {
  void tokens;
  void fills;
  throw new Error(NOT_IMPLEMENTED);
}

/** Exact equality, which is the whole of Metamath's essential-hypothesis check. */
export function same(a: Expression, b: Expression): boolean {
  void a;
  void b;
  throw new Error(NOT_IMPLEMENTED);
}
