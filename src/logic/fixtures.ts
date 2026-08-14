// Test-only support. Never imported by app code — which is what keeps the
// scanner below compatible with DESIGN.md's "No .mm parsing": that is a rule
// about the shipped site, and reference/ is not on the runtime path. Named
// fixtures.ts rather than *.test.ts so vitest doesn't collect it as a suite.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Expression, Statement, Typecode } from "./index";

const SET_MM = resolve("reference/set.mm-propcalc.mm");

/** The raw JSON a palette ships as — the exact bytes the browser will fetch. */
export function readPalette(name: string): string {
  return readFileSync(resolve("public/palettes", `${name}.json`), "utf8");
}

interface Frame {
  floats: { label: string; var: string; typecode: Typecode }[];
  essentials: { label: string; expr: Expression }[];
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
 * its floats are inherited from the enclosing scope and its two `$e`s live
 * inside `${ … $}`, and the palette JSON flattens both away. Deriving the
 * flattening from the file is what stops the test from agreeing with the
 * palette about a mistake.
 */
export function extractStatements(source: string): Map<string, Statement> {
  const tokens = source.split(/\s+/).filter(Boolean);
  const out = new Map<string, Statement>();
  const frames: Frame[] = [{ floats: [], essentials: [] }];
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
      frames.push({ floats: [], essentials: [] });
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
      frame.floats.push({ label, var: name, typecode: typecode as Typecode });
    } else if (kind === "$e") {
      frame.essentials.push({ label, expr: take("$.") });
    } else if (kind === "$a" || kind === "$p") {
      // A $p's conclusion ends at `$=`; the compressed proof runs from there.
      const conclusion = take(kind === "$p" ? "$=" : "$.");
      if (kind === "$p") take("$.");
      out.set(label, mandatory(label, conclusion, frames));
    } else {
      throw new Error(`unexpected ${kind} after label ${label}`);
    }
  }

  return out;
}

/**
 * Metamath's mandatory-hypothesis rule: every `$e` in scope, outermost first,
 * and every `$f` in scope whose variable actually appears — in declaration
 * order, not order of use.
 */
function mandatory(label: string, conclusion: Expression, frames: Frame[]): Statement {
  const essentials = frames.flatMap((f) => f.essentials).map((e) => e.expr);
  const used = new Set<string>([...conclusion, ...essentials.flat()]);
  return {
    label,
    floats: frames
      .flatMap((f) => f.floats)
      .filter((f) => used.has(f.var))
      .map(({ var: name, typecode }) => ({ var: name, typecode })),
    essentials,
    conclusion,
  };
}

let cached: Map<string, Statement> | undefined;

/** set.mm through propositional calculus, read once per test process. */
export function setMm(): Map<string, Statement> {
  cached ??= extractStatements(readFileSync(SET_MM, "utf8"));
  return cached;
}
