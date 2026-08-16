// DESIGN.md calls "the logic layer is pure TypeScript with zero DOM imports"
// non-negotiable, and gives the reason: logic bugs and UI bugs must never be
// confusable, and this layer is what a later cross-check against external
// Metamath tooling would talk to. A rule that only exists in prose is a rule
// the next commit can break without anything going red — so it lives here.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LOGIC = resolve("src/logic");

// Anything only a browser provides. `fetch` is on the list deliberately: a
// palette is fetched by the UI and handed to this layer as text, never fetched
// from inside it, which is what keeps the layer runnable under mmverify-style
// cross-checks and in a plain node test.
const BROWSER_GLOBALS = [
  "document", "window", "navigator", "location", "localStorage",
  "sessionStorage", "fetch", "requestAnimationFrame", "customElements",
];

/** The layer's own modules — not its tests, and not the test-only fixtures. */
const modules = readdirSync(LOGIC)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fixtures.ts")
  .map((f) => ({ name: f, code: readFileSync(join(LOGIC, f), "utf8") }));

describe("the logic layer is pure", () => {
  it("has modules to check", () => {
    // Guards against the glob quietly matching nothing, which would make every
    // assertion below vacuously true.
    expect(modules.map((m) => m.name).sort()).toEqual([
      "card.ts", "chip.ts", "expression.ts", "index.ts", "palette.ts", "types.ts",
    ]);
  });

  for (const { name, code } of modules) {
    // Comments talk about the DOM (this file's own reasoning does); code must not.
    const source = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    describe(name, () => {
      it("imports nothing outside the layer", () => {
        const specifiers = [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]);
        for (const specifier of specifiers) {
          expect(specifier, `${name} imports ${specifier}`).toMatch(/^\.\.?\//);
        }
      });

      it("touches no browser global", () => {
        for (const global of BROWSER_GLOBALS) {
          expect(source, `${name} references ${global}`).not.toMatch(
            new RegExp(`\\b${global}\\b`),
          );
        }
      });

      it("names no DOM type", () => {
        expect(source, `${name} names a DOM type`).not.toMatch(/\bHTML[A-Za-z]*Element\b/);
      });
    });
  }
});
