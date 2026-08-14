import { instantiate, same } from "./expression";
import type { BlockInstance, Expr, Expression, Statement, Variable } from "./types";

/**
 * A palette chip as a droppable piece: `wph $f wff ph $.` becomes `["wff","ph"]`.
 * A chip is a slotless block, so its provenance has the same shape as any
 * other block's — one shape here, not two.
 */
export function variableExpr(v: Variable): Expr {
  return {
    tokens: [v.typecode, v.var],
    provenance: { label: v.label, fills: {}, locks: [] },
  };
}

/**
 * A fresh, empty block. `id` is supplied rather than minted from a module
 * counter: a counter would make this layer impure and its tests order-dependent,
 * and the UI owns identity anyway.
 */
export function createInstance(statement: Statement, id: string): BlockInstance {
  return {
    statement,
    fills: new Map(),
    locks: statement.essentials.map(() => null),
    id,
  };
}

/**
 * The block's statements under the current fills — what the block *reads as*
 * right now, at any fill state. This is the display view; `conclusionExpr` is
 * the harvest view, and keeping them apart is what stops a half-filled
 * conclusion from becoming a droppable piece.
 *
 * A pure function of `statement` + `fills`: recompute, don't cache.
 */
export function instantiated(instance: BlockInstance): {
  essentials: Expression[];
  conclusion: Expression;
} {
  const { statement, fills } = instance;
  return {
    essentials: statement.essentials.map((e) => instantiate(e, fills)),
    conclusion: instantiate(statement.conclusion, fills),
  };
}

const allFloatsFilled = (instance: BlockInstance): boolean =>
  instance.statement.floats.every((f) => instance.fills.has(f.var));

/** A parameter slot takes a piece whose typecode matches. That is the whole check. */
export function canFillFloat(instance: BlockInstance, varName: string, expr: Expr): boolean {
  const float = instance.statement.floats.find((f) => f.var === varName);
  return (
    float !== undefined && !instance.fills.has(varName) && expr.tokens[0] === float.typecode
  );
}

/**
 * Fill a parameter slot, returning a *new* instance — nothing upstream is
 * mutated. DESIGN.md names only the predicates; the verbs are M1's addition,
 * because a derivation has to be driveable through the public API.
 *
 * Throws on an illegal fill rather than returning null: the premise of the
 * design is that illegal moves are impossible (the UI asks `canFillFloat` first
 * and only offers legal targets), so a failed fill is a bug and should be loud.
 */
export function fillFloat(instance: BlockInstance, varName: string, expr: Expr): BlockInstance {
  if (!canFillFloat(instance, varName, expr)) {
    throw new Error(
      `${instance.statement.label}: cannot fill ${varName} with ${expr.tokens.join(" ")}`,
    );
  }
  return { ...instance, fills: new Map(instance.fills).set(varName, expr) };
}

/**
 * A lock slot takes a piece that matches its essential hypothesis *exactly*,
 * and only once every float is filled — until then the essential still contains
 * variables and there is nothing definite to match against.
 *
 * One comparison, over the whole token array including the typecode. No
 * separate typecode check is needed or wanted: the instantiated essential
 * starts with `|-` and so does any candidate, and splitting this into a check
 * across two shapes is exactly how an "exact equality" test quietly starts
 * passing near-misses.
 *
 * The already-satisfied guard is M1's addition — DESIGN.md is silent, but
 * refilling a satisfied lock would discard its provenance without saying so.
 */
export function canFillLock(instance: BlockInstance, index: number, expr: Expr): boolean {
  const essential = instance.statement.essentials[index];
  if (essential === undefined || instance.locks[index] !== null) return false;
  if (!allFloatsFilled(instance)) return false;
  return same(expr.tokens, instantiate(essential, instance.fills));
}

/** Satisfy a lock slot, returning a *new* instance. Throws on an illegal fill. */
export function fillLock(instance: BlockInstance, index: number, expr: Expr): BlockInstance {
  if (!canFillLock(instance, index, expr)) {
    throw new Error(
      `${instance.statement.label}: ${expr.tokens.join(" ")} does not satisfy hypothesis ${index}`,
    );
  }
  // Only the provenance is kept: the tokens are already equal to the
  // instantiated essential, so storing them would be a second source of truth.
  const locks = [...instance.locks];
  locks[index] = expr.provenance;
  return { ...instance, locks };
}

export function isComplete(instance: BlockInstance): boolean {
  return allFloatsFilled(instance) && instance.locks.every((lock) => lock !== null);
}

/**
 * The block's conclusion as a droppable piece, carrying the proof that produced
 * it. Throws unless the block is complete — a conclusion under partial fills is
 * something to look at, not something to use.
 */
export function conclusionExpr(instance: BlockInstance): Expr {
  if (!isComplete(instance)) {
    throw new Error(`${instance.statement.label}: block is not complete`);
  }
  return {
    tokens: instantiate(instance.statement.conclusion, instance.fills),
    provenance: {
      label: instance.statement.label,
      fills: Object.fromEntries(
        [...instance.fills].map(([name, expr]) => [name, expr.provenance]),
      ),
      locks: [...instance.locks],
    },
  };
}
