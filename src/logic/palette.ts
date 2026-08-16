import { TYPECODES } from "./types";
import type { Expression, Palette, Socket, Template, Typecode, Variable } from "./types";

/**
 * Shape-check a parsed palette. A plain assert function rather than a schema
 * library: at this size zod would be more dependency than check.
 *
 * Malformed palettes throw loudly, naming the path that is wrong. A palette is
 * hand-authored and loaded once at startup, so a quiet partial load would
 * surface much later as a card that mysteriously accepts nothing — and the only
 * visible symptom would be in the interaction, where it is hardest to read.
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

  const socket = (v: unknown, path: string): Socket => {
    const s = record(v, path);
    return {
      var: name(s["var"], `${path}.var`),
      typecode: typecode(s["typecode"], `${path}.typecode`),
    };
  };

  const root = record(value, "palette");
  const seen = new Set<string>();

  const variables: Variable[] = array(root["variables"], "variables").map((v, i) => {
    const path = `variables[${i}]`;
    const declared = record(v, path);
    const label = name(declared["label"], `${path}.label`);
    if (seen.has(label)) fail(path, `repeats the label ${label}`);
    seen.add(label);
    return { label, ...socket(v, path) };
  });

  const templates: Template[] = array(root["templates"], "templates").map((v, i) => {
    const path = `templates[${i}]`;
    const t = record(v, path);
    const label = name(t["label"], `${path}.label`);
    if (seen.has(label)) fail(path, `repeats the label ${label}`);
    seen.add(label);

    const sockets = array(t["sockets"], `${path}.sockets`).map((s, j) =>
      socket(s, `${path}.sockets[${j}]`),
    );
    const locks = array(t["locks"], `${path}.locks`).map((e, j) =>
      expression(e, `${path}.locks[${j}]`),
    );
    const conclusion = expression(t["conclusion"], `${path}.conclusion`);

    const slots = new Set(sockets.map((s) => s.var));
    if (slots.size !== sockets.length) fail(`${path}.sockets`, "declares a variable twice");

    // Every variable the template mentions must have a socket to fill it. Without
    // this a dropped socket leaves a variable that can never be substituted, and
    // the card would complete while still reading as a schema.
    const declaredVars = new Set(variables.map((x) => x.var));
    for (const token of [...locks.flat(), ...conclusion]) {
      if (declaredVars.has(token) && !slots.has(token)) {
        fail(path, `uses ${token} but declares no socket for it`);
      }
    }

    return { label, sockets, locks, conclusion };
  });

  Object.assign(root, { variables, templates });
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

/** Look a template up by label. Throws if the palette hasn't got it. */
export function template(palette: Palette, label: string): Template {
  const found = palette.templates.find((t) => t.label === label);
  if (!found) throw new Error(`palette has no template ${label}`);
  return found;
}

/** Look a variable chip's declaration up by the variable it declares. */
export function variable(palette: Palette, varName: string): Variable {
  const found = palette.variables.find((v) => v.var === varName);
  if (!found) throw new Error(`palette has no variable ${varName}`);
  return found;
}
