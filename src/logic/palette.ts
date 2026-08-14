import { TYPECODES } from "./types";
import type { Expression, Float, Palette, Statement, Typecode, Variable } from "./types";

/**
 * Shape-check a parsed palette. A plain assert function rather than a schema
 * library: at this size zod would be more dependency than check.
 *
 * Malformed palettes throw loudly, naming the path that is wrong. A palette is
 * hand-authored and loaded once at startup, so a quiet partial load would
 * surface much later as a block that mysteriously accepts nothing — and the
 * only visible symptom would be in the interaction, where it is hardest to read.
 */
export function assertPalette(value: unknown, source: string): asserts value is Palette {
  const fail = (path: string, why: string): never => {
    throw new Error(`${source}: ${path} ${why}`);
  };

  const record = (v: unknown, path: string): Record<string, unknown> => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      fail(path, "must be an object");
    }
    return v as Record<string, unknown>;
  };

  const array = (v: unknown, path: string): unknown[] => {
    if (!Array.isArray(v)) fail(path, "must be an array");
    return v as unknown[];
  };

  const typecode = (v: unknown, path: string): Typecode => {
    if (typeof v !== "string" || !(TYPECODES as readonly string[]).includes(v)) {
      fail(path, `must be one of ${TYPECODES.join(", ")}`);
    }
    return v as Typecode;
  };

  const name = (v: unknown, path: string): string => {
    if (typeof v !== "string" || v === "") fail(path, "must be a non-empty string");
    // `same` compares expressions by joining on a space, so a token carrying
    // whitespace would let two different expressions compare equal. Forbidding
    // it here is what makes that comparison sound rather than merely lucky.
    if (/\s/.test(v as string)) fail(path, "must not contain whitespace");
    return v as string;
  };

  const expression = (v: unknown, path: string): Expression => {
    const tokens = array(v, path);
    if (tokens.length === 0) fail(path, "must have at least its typecode");
    typecode(tokens[0], `${path}[0]`);
    return tokens.map((t, i) => name(t, `${path}[${i}]`));
  };

  const float = (v: unknown, path: string): Float => {
    const f = record(v, path);
    return { var: name(f["var"], `${path}.var`), typecode: typecode(f["typecode"], `${path}.typecode`) };
  };

  const root = record(value, "palette");
  const seen = new Set<string>();

  const variables: Variable[] = array(root["variables"], "variables").map((v, i) => {
    const path = `variables[${i}]`;
    const declared = record(v, path);
    const label = name(declared["label"], `${path}.label`);
    if (seen.has(label)) fail(path, `repeats the label ${label}`);
    seen.add(label);
    return { label, ...float(v, path) };
  });

  const statements: Statement[] = array(root["statements"], "statements").map((v, i) => {
    const path = `statements[${i}]`;
    const s = record(v, path);
    const label = name(s["label"], `${path}.label`);
    if (seen.has(label)) fail(path, `repeats the label ${label}`);
    seen.add(label);

    const floats = array(s["floats"], `${path}.floats`).map((f, j) =>
      float(f, `${path}.floats[${j}]`),
    );
    const essentials = array(s["essentials"], `${path}.essentials`).map((e, j) =>
      expression(e, `${path}.essentials[${j}]`),
    );
    const conclusion = expression(s["conclusion"], `${path}.conclusion`);

    const slots = new Set(floats.map((f) => f.var));
    if (slots.size !== floats.length) fail(`${path}.floats`, "declares a variable twice");

    // Every variable the statement mentions must have a slot to fill it. Without
    // this a dropped float leaves a variable that can never be substituted, and
    // the block would complete while still reading as a schema.
    const declaredVars = new Set(variables.map((x) => x.var));
    for (const token of [...essentials.flat(), ...conclusion]) {
      if (declaredVars.has(token) && !slots.has(token)) {
        fail(path, `uses ${token} but declares no float for it`);
      }
    }

    return { label, floats, essentials, conclusion };
  });

  Object.assign(root, { variables, statements });
}

export function parsePalette(json: string, source: string): Palette {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new Error(`${source}: is not valid JSON`, { cause });
  }
  assertPalette(value, source);
  return value;
}

/** Look a statement up by label. Throws if the palette hasn't got it. */
export function statement(palette: Palette, label: string): Statement {
  const found = palette.statements.find((s) => s.label === label);
  if (!found) throw new Error(`palette has no statement ${label}`);
  return found;
}
