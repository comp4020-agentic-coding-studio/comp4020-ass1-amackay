import { substitute } from "./expression";
import type { Chip, Expression, Template, Variable } from "./types";

/**
 * A variable chip is a slotless template — `wph $f wff ph $.` becomes a template
 * whose conclusion is `["wff", "ph"]` and which has nothing to fill. Making that
 * real rather than asserting it is what keeps one shape in the model instead of
 * two: a `ph` chip and an `ax-1` chip are the same kind of thing.
 */
export function variableTemplate(v: Variable): Template {
  return { label: v.label, sockets: [], locks: [], conclusion: [v.typecode, v.var] };
}

/** That template, already complete, because a slotless template has nothing to wait for. */
export function variableChip(v: Variable): Chip {
  return { template: variableTemplate(v), fills: {}, keys: [] };
}

/**
 * What a chip reads as: its template's conclusion with every socket variable
 * replaced by the conclusion of whatever fills it.
 *
 * One pass over `template.conclusion`, recursing through fills. Recursion only
 * ever runs through complete chips, so simultaneity is structural — there is no
 * splice ordering to get wrong, and no way to half-substitute.
 *
 * Recompute, don't cache. A chip is immutable, so a cache would only ever be a
 * second place for the answer to live.
 */
export function conclusionTokens(chip: Chip): Expression {
  return substitute(chip.template.conclusion, (token) => {
    // Record indexing types as Chip, but only socket variables are ever keys.
    const fill: Chip | undefined = chip.fills[token];
    return fill ? conclusionTokens(fill) : undefined;
  });
}
