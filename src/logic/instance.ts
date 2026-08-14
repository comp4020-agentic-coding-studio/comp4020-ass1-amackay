import type { BlockInstance, Expr, Expression, Statement, Variable } from "./types";

const NOT_IMPLEMENTED = "M1: not implemented";

/** A palette chip as a droppable piece: `wph $f wff ph $.` becomes `["wff","ph"]`. */
export function variableExpr(v: Variable): Expr {
  void v;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * A fresh, empty block. `id` is supplied rather than minted from a module
 * counter: a counter would make this layer impure and its tests order-dependent,
 * and the UI owns identity anyway.
 */
export function createInstance(statement: Statement, id: string): BlockInstance {
  void statement;
  void id;
  throw new Error(NOT_IMPLEMENTED);
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
  void instance;
  throw new Error(NOT_IMPLEMENTED);
}

export function canFillFloat(instance: BlockInstance, varName: string, expr: Expr): boolean {
  void instance;
  void varName;
  void expr;
  throw new Error(NOT_IMPLEMENTED);
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
  void instance;
  void varName;
  void expr;
  throw new Error(NOT_IMPLEMENTED);
}

export function canFillLock(instance: BlockInstance, index: number, expr: Expr): boolean {
  void instance;
  void index;
  void expr;
  throw new Error(NOT_IMPLEMENTED);
}

/** Satisfy a lock slot, returning a *new* instance. Throws on an illegal fill. */
export function fillLock(instance: BlockInstance, index: number, expr: Expr): BlockInstance {
  void instance;
  void index;
  void expr;
  throw new Error(NOT_IMPLEMENTED);
}

export function isComplete(instance: BlockInstance): boolean {
  void instance;
  throw new Error(NOT_IMPLEMENTED);
}

/** The block's conclusion as a droppable piece. Throws unless the block is complete. */
export function conclusionExpr(instance: BlockInstance): Expr {
  void instance;
  throw new Error(NOT_IMPLEMENTED);
}
