import { describe, expect, it } from "vitest";
import { parsePalette, statement } from "./index";
import { readPalette } from "./fixtures";

const PALETTES = ["design-study", "prototype"] as const;

/** A minimal well-formed palette, mutated per test to break one thing at a time. */
const wellFormed = () => ({
  variables: [{ label: "wph", var: "ph", typecode: "wff" }],
  statements: [
    {
      label: "wn",
      floats: [{ var: "ph", typecode: "wff" }],
      essentials: [],
      conclusion: ["wff", "-.", "ph"],
    },
  ],
});

const parse = (mutate: (p: ReturnType<typeof wellFormed>) => void) => {
  const palette = wellFormed();
  mutate(palette);
  return () => parsePalette(JSON.stringify(palette), "fixture.json");
};

describe("the shipped palettes", () => {
  it.each(PALETTES)("%s validates", (name) => {
    expect(() => parsePalette(readPalette(name), `${name}.json`)).not.toThrow();
  });

  it("carries the design-study set: variable chips, wi, ax-1", () => {
    const p = parsePalette(readPalette("design-study"), "design-study.json");
    expect(p.variables.map((v) => v.var)).toEqual(["ph", "ps"]);
    expect(p.statements.map((s) => s.label)).toEqual(["wi", "ax-1"]);
  });

  it("carries the prototype set, ax-mp included", () => {
    const p = parsePalette(readPalette("prototype"), "prototype.json");
    expect(p.variables.map((v) => v.var)).toEqual(["ph", "ps", "ch"]);
    expect(p.statements.map((s) => s.label).sort()).toEqual([
      "ax-1", "ax-2", "ax-3", "ax-mp", "wi", "wn",
    ]);
    // ax-mp is the only block with locks, which is what makes it the one that
    // turns a pile of wffs into a derivation.
    expect(statement(p, "ax-mp").essentials).toHaveLength(2);
    for (const label of ["wn", "wi", "ax-1", "ax-2", "ax-3"]) {
      expect(statement(p, label).essentials).toEqual([]);
    }
  });
});

describe("assertPalette rejects", () => {
  it("something that isn't JSON at all", () => {
    expect(() => parsePalette("{oops", "fixture.json")).toThrow(/not valid JSON/);
  });

  it("a missing top-level key", () => {
    expect(parse((p) => delete (p as Partial<typeof p>).statements)).toThrow(
      /statements must be an array/,
    );
  });

  it("a typecode that isn't one", () => {
    expect(parse((p) => (p.statements[0].floats[0].typecode = "wof"))).toThrow(
      /floats\[0\].typecode must be one of/,
    );
  });

  it("an expression that doesn't start with a typecode", () => {
    expect(parse((p) => (p.statements[0].conclusion = ["-.", "ph"]))).toThrow(
      /conclusion\[0\] must be one of/,
    );
  });

  it("an empty expression", () => {
    // The empty *wff* is ["wff"] and legal; an expression with no typecode at
    // all is not, and the two are one token apart.
    expect(parse((p) => (p.statements[0].conclusion = []))).toThrow(
      /conclusion must have at least its typecode/,
    );
    expect(parse((p) => (p.statements[0].conclusion = ["wff"]))).not.toThrow();
  });

  it("a token that isn't a string", () => {
    expect(parse((p) => (p.statements[0].conclusion[2] = 7 as unknown as string))).toThrow(
      /conclusion\[2\] must be a non-empty string/,
    );
  });

  it("a token carrying whitespace", () => {
    // `same` compares expressions by joining on a space, so "ph ps" as one
    // token would make two different expressions compare equal. This is the
    // check that makes that comparison sound rather than lucky.
    expect(parse((p) => (p.statements[0].conclusion[2] = "ph ps"))).toThrow(
      /conclusion\[2\] must not contain whitespace/,
    );
  });

  it("a label used twice", () => {
    expect(parse((p) => p.statements.push({ ...p.statements[0] }))).toThrow(/repeats the label wn/);
  });

  it("a variable used with no float to fill it", () => {
    // The dropped-float case: ax-mp losing the ps it inherits from its
    // enclosing scope would look exactly like this.
    expect(parse((p) => (p.statements[0].floats = []))).toThrow(
      /uses ph but declares no float for it/,
    );
  });
});
