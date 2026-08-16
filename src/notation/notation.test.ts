import { describe, expect, it } from "vitest";
import { parsePalette, type Palette } from "../logic";
import { readPalette } from "../logic/fixtures";
import { ALTHTMLDEF, glyph } from "./index";

const PALETTES: Palette[] = ["design-study", "prototype"].map((name) =>
  parsePalette(readPalette(name), `${name}.json`),
);

describe("the extracted table", () => {
  it("has the whole of set.mm's notation in it, not just what ships today", () => {
    // Extracted in full so a different template set later needs no second trip
    // to set.mm. Also guards the assertions below against a broken extraction
    // making them vacuous.
    expect(Object.keys(ALTHTMLDEF).length).toBeGreaterThan(1500);
  });

  it("carries no empty glyph", () => {
    expect(Object.entries(ALTHTMLDEF).filter(([, value]) => value === "")).toEqual([]);
  });

  it("reads set.mm's propositional notation the way set.mm does", () => {
    // Spot checks against the althtmldef lines themselves. These are the tokens
    // the shipped palettes actually use, so a wrong one is visible on the page.
    expect(glyph("->")).toBe("→");
    expect(glyph("<->")).toBe("↔");
    expect(glyph("-.")).toBe("¬");
    expect(glyph("|-")).toBe("⊢");
    expect(glyph("ph")).toBe("𝜑");
    expect(glyph("ps")).toBe("𝜓");
    expect(glyph("ch")).toBe("𝜒");
    expect(glyph("(")).toBe("(");
    expect(glyph(")")).toBe(")");
  });

  it("leaves a typecode as its own word", () => {
    // set.mm renders these as text, not as a symbol, so they pass through.
    expect(glyph("wff")).toBe("wff");
    expect(glyph("setvar")).toBe("setvar");
    expect(glyph("class")).toBe("class");
  });

  it("joins a definition split across lines", () => {
    // `-1-1-onto->` is three concatenated fragments over three lines — the case
    // that breaks any reader assuming one definition is one line.
    expect(glyph("-1-1-onto->")).toBe("–1-1-onto→");
  });

  it("keeps a glyph whose entity contains a semicolon", () => {
    // `&#8866;` and `&rarr;` put a `;` *inside* the value, so a reader that
    // stops at the first semicolon truncates exactly the entries that matter.
    expect(glyph("|-")).not.toContain(";");
    expect(glyph("e.")).toBe("∈");
  });
});

describe("glyph", () => {
  it("returns a token it has never heard of unchanged", () => {
    // A palette can carry a token set.mm never defined; it should render in the
    // database's own notation rather than vanish.
    expect(glyph("wibble")).toBe("wibble");
  });

  it.each(PALETTES.map((p, i) => [["design-study", "prototype"][i], p] as const))(
    "covers every token the %s palette uses",
    (_name, palette) => {
      // The real sensor: a palette that gains a token with no glyph goes red
      // here rather than shipping a statement half in ASCII.
      const tokens = new Set<string>();
      for (const variable of palette.variables) {
        tokens.add(variable.typecode);
        tokens.add(variable.var);
      }
      for (const template of palette.templates) {
        for (const token of [...template.locks.flat(), ...template.conclusion]) {
          tokens.add(token);
        }
        for (const socket of template.sockets) tokens.add(socket.typecode);
      }

      const missing = [...tokens].filter((token) => ALTHTMLDEF[token] === undefined);
      expect(missing, `no glyph for: ${missing.join(", ")}`).toEqual([]);
    },
  );
});
