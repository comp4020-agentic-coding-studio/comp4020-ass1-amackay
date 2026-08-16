// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { substitute, type Expression } from "../logic";
import { spans, statementCells, tokenCell, typecodeCell } from "./tokens";

// ax-1's conclusion, where `ph` occurs twice.
const AX1: Expression = ["|-", "(", "ph", "->", "(", "ps", "->", "ph", ")", ")"];

const from =
  (table: Record<string, Expression>) =>
  (token: string): Expression | undefined =>
    table[token];

const VARIABLES = new Set(["ph", "ps", "ch"]);

describe("spans", () => {
  it("agrees with the logic layer token for token", () => {
    // The annotation is a rendering concern, but it must never become a second
    // opinion about what a statement says. If substitute changes, this goes red.
    const table = { ph: ["wff", "(", "ch", "->", "ch", ")"], ps: ["wff", "-.", "ch"] };
    expect(spans(AX1, from(table)).map((s) => s.token)).toEqual(substitute(AX1, from(table)));
  });

  it("marks the template's own tokens as coming from nowhere", () => {
    expect(spans(AX1, from({})).every((s) => s.from === null)).toBe(true);
  });

  it("attributes every occurrence of a variable to that variable", () => {
    // Both of ax-1's `ph`s, so M3's flash can highlight them together.
    const run = spans(AX1, from({ ph: ["wff", "-.", "ch"] }));
    expect(run.filter((s) => s.from === "ph").map((s) => s.token)).toEqual([
      "-.", "ch", "-.", "ch",
    ]);
  });

  it("drops the typecode off what it splices in", () => {
    const run = spans(AX1, from({ ph: ["wff", "ch"] }));
    expect(run.map((s) => s.token)).not.toContain("wff");
  });
});

describe("typecodeCell", () => {
  it("separates a claim from a piece of syntax", () => {
    expect(typecodeCell("|-").className).toContain("typecode--stmt");
    expect(typecodeCell("wff").className).toContain("typecode--wff");
    expect(typecodeCell("|-").textContent).toBe("|-");
  });
});

describe("tokenCell", () => {
  it("gives every token its own element, so breaks fall only between them", () => {
    const cell = tokenCell(spans(["(", "ph", "->", "ps", ")"], from({})), VARIABLES);
    expect([...cell.children].map((c) => c.textContent)).toEqual([
      "(", "ph", "->", "ps", ")",
    ]);
  });

  it("keeps -> whole", () => {
    // An arrow split across a line break reads as two different symbols.
    const cell = tokenCell(spans(["->"], from({})), VARIABLES);
    expect(cell.children).toHaveLength(1);
    expect(cell.children[0].textContent).toBe("->");
  });

  it("colours a variable by identity wherever it appears", () => {
    // Both the unfilled variable showing through and one that arrived inside a
    // seated chip are the variable ph, and read as it.
    const cell = tokenCell(spans(["ph", "ps"], from({ ps: ["wff", "ph"] })), VARIABLES);
    const [own, substituted] = [...cell.children] as HTMLElement[];
    expect(own.dataset["var"]).toBe("ph");
    expect(substituted.dataset["var"]).toBe("ph");
    expect(substituted.dataset["from"]).toBe("ps");
  });

  it("tints a substituted token that is not a variable", () => {
    const cell = tokenCell(spans(["ph"], from({ ph: ["wff", "-.", "ch"] })), VARIABLES);
    const [negation, ch] = [...cell.children] as HTMLElement[];
    expect(negation.className).toContain("token--sub");
    // ch is a variable, so identity colour wins over the provenance tint —
    // stacking both would only make mud.
    expect(ch.className).not.toContain("token--sub");
    expect(ch.dataset["var"]).toBe("ch");
  });

  it("leaves the template's own non-variable tokens plain", () => {
    const cell = tokenCell(spans(["(", ")"], from({})), VARIABLES);
    for (const child of cell.children) {
      expect(child.className).toBe("token");
    }
  });
});

describe("statementCells", () => {
  it("puts the typecode in the cell and never in the run", () => {
    const [typecode, run] = statementCells(spans(AX1, from({})), VARIABLES);
    expect(typecode.textContent).toBe("|-");
    expect(run.textContent).not.toContain("|-");
    expect(run.children).toHaveLength(AX1.length - 1);
  });
});
