// "Matches set.mm exactly" as a sensor rather than a comment.
//
// The palettes are hand-authored JSON, and hand-authored means one wrong token
// away from a sandbox that quietly proves something else. This reads the
// statements back out of reference/set.mm-propcalc.mm and compares.
//
// It also derives ax-mp's mandatory hypotheses rather than assuming them: its
// floats are inherited from its enclosing scope and its two $e's sit inside
// ${ … $}, and the palette flattens both. Hardcoding the expected flattening
// here and then "checking" the palette against that hardcoding would agree with
// the palette about a mistake, which is the failure mode reference/README.md
// warns about.

import { describe, expect, it } from "vitest";
import { parsePalette, type Palette } from "./index";
import { readPalette, setMm } from "./fixtures";

const db = setMm();

const PALETTES: Record<string, Palette> = {
  "design-study": parsePalette(readPalette("design-study"), "design-study.json"),
  prototype: parsePalette(readPalette("prototype"), "prototype.json"),
};

describe("the reader itself", () => {
  // Without these, a reader that silently found nothing would make every
  // comparison below pass by comparing nothing to nothing.
  it("finds all 1,778 assertions in the excerpt", () => {
    // 35 $a and 1,743 $p. mmverify.py verifies exactly 1,743 proofs from this
    // file, which is the independent confirmation of the second number.
    expect(db.statements.size).toBe(1778);
  });

  it("is not fooled by the header's documentation of the grammar", () => {
    // The file header explains $e with a line that reads exactly like a
    // statement: `<label> $e <symbollist> $.` A line scanner picks it up.
    expect(db.statements.has("<label>")).toBe(false);
    expect(db.floats.has("<symbollist>")).toBe(false);
  });

  it("reads a $p's conclusion without swallowing its proof", () => {
    // `id $p |- ( ph -> ph ) $=` puts its compressed proof on the next line.
    expect(db.statements.get("id")?.conclusion).toEqual([
      "|-", "(", "ph", "->", "ph", ")",
    ]);
  });

  it("flattens ax-mp's inherited floats and scoped essentials", () => {
    // The transcription decision the palette makes, worked out from the source.
    const axMp = db.statements.get("ax-mp");
    expect(axMp?.floats).toEqual([
      { var: "ph", typecode: "wff" },
      { var: "ps", typecode: "wff" },
    ]);
    expect(axMp?.essentials).toEqual([
      ["|-", "ph"],
      ["|-", "(", "ph", "->", "ps", ")"],
    ]);
  });

  it("keeps floats in declaration order, not order of use", () => {
    // ax-3 mentions ps before ph, but wph is declared before wps.
    expect(db.statements.get("ax-3")?.floats.map((f) => f.var)).toEqual(["ph", "ps"]);
  });

  it("gives a statement only the floats it actually uses", () => {
    // Twelve wff variables are in scope at ax-1; two of them are mandatory.
    expect(db.floats.size).toBeGreaterThan(2);
    expect(db.statements.get("ax-1")?.floats).toHaveLength(2);
  });
});

describe.each(Object.entries(PALETTES))("palette %s matches set.mm", (name, palette) => {
  it("declares its variable chips as set.mm declares them", () => {
    for (const chip of palette.variables) {
      const declared = db.floats.get(chip.var);
      expect(declared, `${name}: ${chip.var} is not declared in the excerpt`).toBeDefined();
      expect(declared).toEqual({ label: chip.label, var: chip.var, typecode: chip.typecode });
    }
  });

  it.each(PALETTES[name].statements.map((s) => s.label))("transcribes %s exactly", (label) => {
    const mine = palette.statements.find((s) => s.label === label)!;
    const theirs = db.statements.get(label);
    expect(theirs, `${label} is not in the excerpt`).toBeDefined();

    // Deep equality on floats catches order and count, not just membership —
    // a palette that lost ax-mp's inherited ps, or listed the two backwards,
    // goes red here.
    expect(mine.floats).toEqual(theirs!.floats);
    expect(mine.essentials).toEqual(theirs!.essentials);
    expect(mine.conclusion).toEqual(theirs!.conclusion);
  });
});
