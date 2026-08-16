// "Matches set.mm exactly" as a sensor rather than a comment.
//
// The palettes are hand-authored JSON, and hand-authored means one wrong token
// away from a sandbox that quietly proves something else. This reads the
// templates back out of reference/set.mm-propcalc.mm and compares.
//
// It also derives ax-mp's mandatory hypotheses rather than assuming them: its
// $f's are inherited from its enclosing scope and its two $e's sit inside
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
    expect(db.templates.size).toBe(1778);
  });

  it("is not fooled by the header's documentation of the grammar", () => {
    // The file header explains $e with a line that reads exactly like a
    // statement: `<label> $e <symbollist> $.` A line scanner picks it up.
    expect(db.templates.has("<label>")).toBe(false);
    expect(db.variables.has("<symbollist>")).toBe(false);
  });

  it("reads a $p's conclusion without swallowing its proof", () => {
    // `id $p |- ( ph -> ph ) $=` puts its compressed proof on the next line.
    expect(db.templates.get("id")?.conclusion).toEqual([
      "|-", "(", "ph", "->", "ph", ")",
    ]);
  });

  it("flattens ax-mp's inherited $f's and scoped $e's", () => {
    // The transcription decision the palette makes, worked out from the source.
    const axMp = db.templates.get("ax-mp");
    expect(axMp?.sockets).toEqual([
      { var: "ph", typecode: "wff" },
      { var: "ps", typecode: "wff" },
    ]);
    expect(axMp?.locks).toEqual([
      ["|-", "ph"],
      ["|-", "(", "ph", "->", "ps", ")"],
    ]);
  });

  it("keeps sockets in declaration order, not order of use", () => {
    // ax-3 mentions ps before ph, but wph is declared before wps.
    expect(db.templates.get("ax-3")?.sockets.map((s) => s.var)).toEqual(["ph", "ps"]);
  });

  it("gives a template only the sockets it actually uses", () => {
    // Twelve wff variables are in scope at ax-1; two of them are mandatory.
    expect(db.variables.size).toBeGreaterThan(2);
    expect(db.templates.get("ax-1")?.sockets).toHaveLength(2);
  });
});

describe.each(Object.entries(PALETTES))("palette %s matches set.mm", (name, palette) => {
  it("declares its variable chips as set.mm declares them", () => {
    for (const chip of palette.variables) {
      const declared = db.variables.get(chip.var);
      expect(declared, `${name}: ${chip.var} is not declared in the excerpt`).toBeDefined();
      expect(declared).toEqual({ label: chip.label, var: chip.var, typecode: chip.typecode });
    }
  });

  it.each(PALETTES[name].templates.map((t) => t.label))("transcribes %s exactly", (label) => {
    const mine = palette.templates.find((t) => t.label === label)!;
    const theirs = db.templates.get(label);
    expect(theirs, `${label} is not in the excerpt`).toBeDefined();

    // Deep equality on sockets catches order and count, not just membership —
    // a palette that lost ax-mp's inherited ps, or listed the two backwards,
    // goes red here.
    expect(mine.sockets).toEqual(theirs!.sockets);
    expect(mine.locks).toEqual(theirs!.locks);
    expect(mine.conclusion).toEqual(theirs!.conclusion);
  });
});
