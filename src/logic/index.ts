// The logic layer's public API. Tests and (from M2) the UI import from here and
// nowhere deeper — that boundary is what "driven entirely through the public
// API" means, and it is what a later cross-check against external Metamath
// tooling would talk to.
//
// Nothing in this directory imports the DOM. `purity.test.ts` enforces it.

export type {
  BlockInstance,
  Expr,
  Expression,
  Float,
  Palette,
  Provenance,
  Statement,
  Token,
  Typecode,
  Variable,
} from "./types";
export { TYPECODES } from "./types";

export { instantiate, same } from "./expression";

export {
  canFillFloat,
  canFillLock,
  conclusionExpr,
  createInstance,
  fillFloat,
  fillLock,
  instantiated,
  isComplete,
  variableExpr,
} from "./instance";

export { assertPalette, parsePalette, statement } from "./palette";
