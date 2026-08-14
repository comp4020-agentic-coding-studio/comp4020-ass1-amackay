# DESIGN.md — Metamath proof sandbox (working title)

Browser prototype: Scratch-style block interface for Metamath-isomorphic
forward derivation. See IDEA.md for concept and rationale; this file is the
implementation authority. Sections marked ⟨DESIGN SESSION⟩ are pending a
separate design study and must not be guessed at — stub them, don't invent.

## Ground rules

- Stack: Vite + React + TypeScript + Tailwind. Static client-side build,
  deployed to GitHub Pages. No backend, no persistence.
- Must work at desktop width and ~380px phone width; keyboard-operable;
  resize-robust.
- No .mm parsing. Palette content is hand-authored JSON, `$d`-free.
- **The logic layer is pure TypeScript with zero React/DOM imports.** UI is a
  thin shell over it. This separation is non-negotiable: logic bugs and UI
  bugs must never be confusable, and the logic layer is what a later
  cross-check harness (external Metamath tooling) will talk to.

## Core model

There is no nesting. Filling a slot substitutes a flat token sequence for a
variable everywhere in the block; the result renders as a flat wrapping token
run. Nothing in the data model or renderer is recursive.

### Types (sketch — refine, don't restructure)

```ts
type Token = string;                    // "(", "ph", "->", ...
type Typecode = "wff" | "setvar" | "class" | "|-";

interface Statement {                   // palette JSON entry
  label: string;                        // e.g. "ax-1"
  floats: { var: string; typecode: Typecode }[];  // in $f order
  essentials: Token[][];                // each begins with its typecode token
  conclusion: Token[];                  // begins with its typecode token
}

interface Expr {                        // a droppable piece
  typecode: Typecode;
  tokens: Token[];                      // excludes the typecode token
  provenance: Provenance;              // kept internally, not surfaced
}

interface BlockInstance {
  statement: Statement;
  fills: Map<string, Expr>;             // float var → substituted expr
  locks: (Provenance | null)[];         // which derived stmt satisfied each essential
  id: string;
}
```

### Operations (the whole logic layer, ~100 lines)

- `substitute(tokens, var, replacement)` — flat token splice, all occurrences.
- `instantiated(instance)` — essentials + conclusion with all current fills
  applied. Pure function of `statement` + `fills`; recompute, don't cache.
- `canFillFloat(instance, var, expr)` — var unfilled ∧ typecode match.
- `canFillLock(instance, i, expr)` — all floats filled ∧ exact token-sequence
  equality (including typecode) against instantiated essential i. String
  equality, nothing cleverer.
- `isComplete(instance)` — all floats filled ∧ all locks satisfied.
- `conclusionExpr(instance)` — the completed block's conclusion as an `Expr`.

Float order gates nothing (fill in any order); locks gate on all-floats-filled.

### Provenance

Every `Expr` records how it was made (statement label + child provenance per
fill/lock). Not rendered anywhere in this prototype; exists so un-collapse
and proof export remain possible without a model change. Keep it cheap
(plain nested object).

## Palette JSON

One file per sandbox, hand-authored: `public/palettes/<name>.json` —
`{ variables: {var: typecode}[], statements: Statement[] }`.

- Design-study palette: `wph`-style variable chips (`ph`, `ps`), `wi`, `ax-1`.
- Full prototype palette: variable chips, `wn`, `wi`, `ax-1`, `ax-2`, `ax-3`,
  `ax-mp` (first block with a lock slot). Transcribe faithfully from set.mm's
  opening; token strings must match set.mm exactly.
- Validate the JSON shape at load with a plain TS assert function (no zod —
  overkill at this size). Malformed palette = throw at startup, loudly.

## Interaction semantics (settled)

- Palette → bench always **copies**; palette originals are permanent.
- Bench blocks have a delete affordance. Nothing is ever consumed by use —
  derived statements are facts, not resources.
- A completed block can be **kept**: its conclusion chip joins the "derived"
  half of the palette (deletable, reusable like any palette piece).
- No dragging bench → palette; no saving half-filled blocks.
- Droppable pieces are: variable chips, and conclusions of completed blocks.
- On any fill, every rewritten token span flash-highlights (~400ms, one CSS
  class). Full morph animation is out of scope.

## ⟨DESIGN SESSION⟩ Interaction mode

Drag vs carry undecided. **Build the interaction as a state machine over
logic-layer operations so the choice is swappable**: states (idle / lifted /
over-legal-slot), transitions driven by pointer+keyboard events, with the
event→transition mapping as the only mode-specific part. Paste the design
session's handoff state machine here verbatim when it exists.

## ⟨DESIGN SESSION⟩ Layout, visual spec, wrap rules

Palette/bench arrangement per viewport, element visual tokens (as CSS custom
properties), and token-run wrap rules all come from the design handoff doc.
Until then: unstyled-but-structured rendering is fine for M1–M2; do not
invent a visual language.

## Build order

- **M1 — Logic + data.** Logic layer, vitest suite, both palette JSON files,
  JSON validator. Tests must cover: multi-occurrence substitution (ax-1's
  double `ph`), typecode rejection, lock equality including near-miss
  (differs by one token), lock gating on unfilled floats, completion, and a
  full scripted derivation of `⊢ ( ph -> ph )` from ax-1/ax-2/ax-mp driven
  entirely through the public API. That derivation test is the acceptance
  test for the whole layer.
- **M2 — Static render.** Blocks, token runs, empty notches, filled spans,
  collapsed chip; both viewports. Include a wrap stress fixture (deeply
  chained `wi` instantiation) rendered at 380px. Kill-switch: if wrapping is
  irredeemable on phone, per-statement horizontal scroll is the fallback.
- **M3 — Interaction.** State machine + legal-target highlighting + rewrite
  flash, per design handoff. Playable milestone: stop and derive
  `⊢ ( ph -> ph )` by hand the moment it works.
- **M4 — Keep/derived list, delete, deploy.** GitHub Pages workflow, demo
  pass at both viewports.

M1 is fully specified now and independent of every open design question —
start there.

## Verification workflow

Acceptance tests first; headless Chromium checks at three viewports
(≈380 / 768 / 1280) for M2 onward; PR → merge → delete branch, no human
review (prototype mode). `npm test` and the Chromium pass must be green
before any merge.

## Out of scope (do not build)

Distinct variable conditions, RPN export, backwards reasoning, unification,
targets/levels, tutorials, .mm parsing, proof-tree display, persistence.
