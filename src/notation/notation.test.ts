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
    expect(glyph("(")).toBe("(");
    expect(glyph(")")).toBe(")");
  });

  it("keeps set.mm's own codepoints in the extracted table", () => {
    // The table is what set.mm says, unedited: the variables are Mathematical
    // Alphanumeric Symbols, not Greek letters that look like them.
    expect(ALTHTMLDEF["ph"]).toBe("𝜑");
    expect(ALTHTMLDEF["ps"]).toBe("𝜓");
    expect(ALTHTMLDEF["ch"]).toBe("𝜒");
  });
});

describe("folding Mathematical Alphanumeric Symbols", () => {
  it("renders a variable as the letter it decomposes to", () => {
    // U+1D711 to U+03C6. Almost no font has the first; every font has the
    // second, which is the whole point — see src/notation/index.ts.
    expect(glyph("ph")).toBe("φ");
    expect(glyph("ps")).toBe("ψ");
    expect(glyph("ch")).toBe("χ");
    for (const token of ["ph", "ps", "ch"]) {
      expect([...glyph(token)].map((c) => c.codePointAt(0) ?? 0)).toSatisfy(
        (points: number[]) => points.every((point) => point < 0x1_d400),
      );
    }
  });

  it("leaves everything outside that block alone", () => {
    // NFKD across the whole string would also flatten ℕ to N and ℝ to R, which
    // are distinctions set.mm means. The fold is scoped to the one block whose
    // characters no font has.
    expect(glyph("NN")).toBe("ℕ");
    expect(glyph("RR")).toBe("ℝ");
    expect(glyph("->")).toBe("→");
  });

  it("makes no two tokens of a shipped palette look the same", () => {
    // The real cost of the fold is collisions, and the only ones that matter
    // are between tokens a palette actually uses. 29 pairs collide across the
    // whole table; none of them are here, and this is what says so.
    for (const palette of PALETTES) {
      const tokens = new Set<string>();
      for (const variable of palette.variables) tokens.add(variable.var);
      for (const template of palette.templates) {
        for (const token of [...template.locks.flat(), ...template.conclusion]) tokens.add(token);
      }

      const byGlyph = new Map<string, string[]>();
      for (const token of tokens) {
        const rendered = glyph(token);
        byGlyph.set(rendered, [...(byGlyph.get(rendered) ?? []), token]);
      }
      const clashes = [...byGlyph].filter(([, sharing]) => sharing.length > 1);
      expect(clashes, `tokens rendering identically: ${JSON.stringify(clashes)}`).toEqual([]);
    }
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
