// The logic layer's public API. Tests and (from M2) the UI import from here and
// nowhere deeper — that boundary is what "driven entirely through the public
// API" means, and it is what a later cross-check against external Metamath
// tooling would talk to.
//
// Nothing in this directory imports the DOM. `purity.test.ts` enforces it.

export type {
  Card,
  Chip,
  Expression,
  Palette,
  Placement,
  Socket,
  Template,
  Token,
  Typecode,
  Variable,
} from "./types";
export { TYPECODES } from "./types";

export { same, substitute } from "./expression";

export { conclusionTokens, variableChip, variableTemplate } from "./chip";

export {
  canSeatLock,
  canSeatSocket,
  createCard,
  freeze,
  instantiatedConclusion,
  instantiatedLocks,
  isComplete,
  seatLock,
  seatSocket,
} from "./card";

export { assertPalette, parsePalette, template, variable } from "./palette";
