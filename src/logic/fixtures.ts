// Test-only support. Never imported by app code — which is what keeps the
// scanner below compatible with DESIGN.md's "No .mm parsing": that is a rule
// about the shipped site, and reference/ is not on the runtime path. Named
// fixtures.ts rather than *.test.ts so vitest doesn't collect it as a suite.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Expression, Template, Typecode, Variable } from "./index";

const SET_MM = resolve("reference/set.mm-propcalc.mm");

/** The raw JSON a palette ships as — the exact bytes the bundle will carry. */
export function readPalette(name: string): string {
  return readFileSync(resolve("src/palettes", `${name}.json`), "utf8");
}

interface Frame {
  variables: Variable[];
  locks: { label: string; expr: Expression }[];
}

/** A Metamath database read far enough to check a palette against it. */
export interface Database {
  /** Every `$a` and `$p`, with its mandatory hypotheses worked out. */
  templates: Map<string, Template>;
  /** Every `$f`, by the variable it declares — the palette's chips. */
  variables: Map<string, Variable>;
}

/**
 * Read every `$a`/`$p` out of a Metamath database, with its mandatory
 * hypotheses worked out the way Metamath works them out.
 *
 * This is a token walker, not a line scanner, and both halves of that matter:
 * the set.mm header documents the grammar with lines that read exactly like
 * real statements (`<label> $e <symbollist> $.`, line 224), and `id $p` puts its
 * proof on the line after its conclusion. A line scanner gets both wrong.
 *
 * The point of computing the hypotheses rather than hardcoding them is ax-mp:
 * its `$f`s are inherited from the enclosing scope and its two `$e`s live inside
 * `${ … $}`, and the palette JSON flattens both away. Deriving the flattening
 * from the file is what stops the test from agreeing with the palette about a
 * mistake.
 */
export function readDatabase(source: string): Database {
  const tokens = source.split(/\s+/).filter(Boolean);
  const templates = new Map<string, Template>();
  const variables = new Map<string, Variable>();
  const frames: Frame[] = [{ variables: [], locks: [] }];
  let i = 0;

  // Consume tokens up to and including `terminator`, returning what came before.
  const take = (terminator: string): string[] => {
    const body: string[] = [];
    while (i < tokens.length && tokens[i] !== terminator) body.push(tokens[i++]);
    if (i >= tokens.length) throw new Error(`unterminated ${terminator}`);
    i++;
    return body;
  };

  while (i < tokens.length) {
    const token = tokens[i++];

    if (token === "$(") {
      take("$)"); // comments are not nestable, so one span is one skip
      continue;
    }
    if (token === "$[") {
      take("$]");
      continue;
    }
    if (token === "${") {
      frames.push({ variables: [], locks: [] });
      continue;
    }
    if (token === "$}") {
      frames.pop();
      continue;
    }
    if (token === "$c" || token === "$v" || token === "$d") {
      take("$.");
      continue;
    }

    // Everything else is a label; the token after it says what kind.
    const label = token;
    const kind = tokens[i++];
    const frame = frames[frames.length - 1];

    if (kind === "$f") {
      const [typecode, name] = take("$.");
      const declared: Variable = { label, var: name, typecode: typecode as Typecode };
      frame.variables.push(declared);
      variables.set(name, declared);
    } else if (kind === "$e") {
      frame.locks.push({ label, expr: take("$.") });
    } else if (kind === "$a" || kind === "$p") {
      // A $p's conclusion ends at `$=`; the compressed proof runs from there.
      const conclusion = take(kind === "$p" ? "$=" : "$.");
      if (kind === "$p") take("$.");
      templates.set(label, mandatory(label, conclusion, frames));
    } else {
      throw new Error(`unexpected ${kind} after label ${label}`);
    }
  }

  return { templates, variables };
}

/**
 * Metamath's mandatory-hypothesis rule: every `$e` in scope, outermost first,
 * and every `$f` in scope whose variable actually appears — in declaration
 * order, not order of use.
 */
function mandatory(label: string, conclusion: Expression, frames: Frame[]): Template {
  const locks = frames.flatMap((f) => f.locks).map((e) => e.expr);
  const used = new Set<string>([...conclusion, ...locks.flat()]);
  return {
    label,
    sockets: frames
      .flatMap((f) => f.variables)
      .filter((v) => used.has(v.var))
      .map(({ var: name, typecode }) => ({ var: name, typecode })),
    locks,
    conclusion,
  };
}

let cached: Database | undefined;

/** set.mm through propositional calculus, read once per test process. */
export function setMm(): Database {
  cached ??= readDatabase(readFileSync(SET_MM, "utf8"));
  return cached;
}
