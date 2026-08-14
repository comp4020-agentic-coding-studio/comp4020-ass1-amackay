# DESIGN.md — Metamath proof sandbox (working title)

Implementation authority. Concept and rationale live in IDEA.md. Where this
file and `CLAUDE.md` disagree, `CLAUDE.md` wins. ⟨OPEN⟩ marks decisions not yet
made — stub them, don't guess.

## Ground rules

- **Stack is the template as it ships**: Vite + TypeScript + plain CSS, no
  framework. Static, client-side, no persistence. (No React: there is no text
  entry anywhere in this UI, so a block can be rebuilt wholesale on change. No
  Tailwind: it fights `stylelint-config-standard`, and the design handoff is
  CSS custom properties, which plain CSS takes directly.)
- **Marking viewports are exactly 390×844 and 1920×1080.** Keyboard-operable,
  resize-robust.
- **The logic layer is pure TypeScript with zero DOM imports.** UI is a thin
  shell over it. Non-negotiable: logic bugs and UI bugs must never be
  confusable, and this layer is what a later cross-check against external
  Metamath tooling would talk to.
- **The core interaction is marked in the DOM** — `data-core-interaction` on
  the control the visitor operates, `data-core-output` on the region that
  changes. `spec/assignment-1.test.ts` finds it through these and requires the
  control to be tab-reachable.
- No .mm parsing. Palette content is hand-authored JSON, `$d`-free.

## Core model

No nesting. Filling a slot substitutes a flat token sequence for a variable
throughout the block; the result renders as a wrapping token run. Nothing in
the model or the renderer is recursive.

**One representation: a token array whose first token is its typecode.** That
makes palette JSON a literal transcription of set.mm (`wph $f wff ph $.` is
`["wff", "ph"]`), and makes the lock check one comparison instead of one across
two shapes — which is how an "exact equality" check quietly starts passing
near-misses.

```ts
type Token = string;                    // "(", "ph", "->", ...
type Typecode = "wff" | "setvar" | "class" | "|-";
type Expression = Token[];              // tokens[0] is always the typecode

interface Statement {                   // palette JSON entry
  label: string;                        // e.g. "ax-1"
  floats: { var: string; typecode: Typecode }[];  // in $f order
  essentials: Expression[];
  conclusion: Expression;
}

interface Expr {                        // a droppable piece
  tokens: Expression;
  provenance: Provenance;               // kept internally, not surfaced
}

interface BlockInstance {
  statement: Statement;
  fills: Map<string, Expr>;             // float var → substituted expr
  locks: (Provenance | null)[];         // which derived stmt satisfied each essential
  id: string;
}
```

### Operations (~100 lines, the whole layer)

- `instantiate(tokens, fills)` — **one pass**: a token that is a filled float
  variable becomes that fill's tokens minus its typecode (`slice(1)`);
  everything else, including an unfilled variable, copies through.

  **Not repeated single-variable splices.** Metamath substitution is
  simultaneous. On ax-1, `ph := ps` with `ps := ph` gives
  `( ps -> ( ph -> ps ) )`; splicing one variable at a time gives
  `( ph -> ( ph -> ph ) )`, because the second pass eats what the first wrote.
  The `slice(1)` matters too — splicing a `wff` expression in whole would
  strand its typecode token mid-statement.
- `instantiated(instance)` — essentials + conclusion under the current fills.
  Pure function of `statement` + `fills`; recompute, don't cache.
- `canFillFloat(instance, var, expr)` — variable unfilled ∧ `expr.tokens[0]`
  matches the slot's typecode.
- `canFillLock(instance, i, expr)` — all floats filled ∧
  `a.join(" ") === b.join(" ")` against instantiated essential `i`. Nothing
  cleverer; this literalness is the point of the prototype.
- `isComplete(instance)`, `conclusionExpr(instance)`.

Floats fill in any order; locks gate on all-floats-filled.

**Provenance.** Every `Expr` records how it was made (statement label + child
provenance per fill/lock). Rendered nowhere here; exists so un-collapse and
proof export stay possible without a model change. Plain nested object.

## Palette JSON

`public/palettes/<name>.json` — `{ variables, statements }`, shape-checked at
load by a plain TS assert function (no zod at this size). Malformed palette
throws loudly at startup.

- Design-study palette: variable chips (`ph`, `ps`), `wi`, `ax-1`.
- Prototype palette: variable chips, `wn`, `wi`, `ax-1`, `ax-2`, `ax-3`,
  `ax-mp` (first block with a lock slot).
- Source of truth is `reference/set.mm-propcalc.mm` (see `reference/README.md`)
  — set.mm through the end of propositional calculus, byte-verbatim, 614 KB,
  `$d`-free throughout and verified standalone by `reference/mmverify.py`.
  **Test the palette's tokens against it**, so "matches set.mm exactly" is a
  sensor rather than a comment.

## ⟨OPEN⟩ Design decisions

Not settled. Don't build past them, and don't let an implementation choice
quietly decide one.

- **Interaction mode** — drag vs carry. Build it as a state machine over
  logic-layer operations (idle / lifted / over-legal-slot) so the choice stays
  swappable and only the event→transition mapping is mode-specific. Constraint
  either answer has to satisfy: 390px touch *and* full keyboard operation.
- **Palette semantics** — copy vs move; whether a completed block auto-collapses
  into a derived list; whether half-filled blocks can be kept; whether anything
  is consumed by use. IDEA.md's candidate is a starter/derived split, still
  open on details and naming.
- **Layout and visual language** — arrangement per viewport, visual tokens as
  CSS custom properties, token-run wrap rules. From the design session; until
  then unstyled-but-structured rendering is fine through M1–M2.
- **Whether the page frames itself** — the marker opens the deployed URL alone
  and uses it for a minute, so "sandbox, no target, may need an
  over-the-shoulder explanation" and "interactive explainer" pull against each
  other. If anything is in, it's a title, a sentence or two, and one ignorable
  invitation — prose, not architecture. Decide before M4.

## Build order

- **M1 — Logic + data.** The layer, its vitest suite, both palettes, the
  validator. Tests: multi-occurrence substitution (ax-1's double `ph`);
  simultaneous substitution under a swap; typecode rejection; lock equality
  including a one-token near-miss; lock gating on unfilled floats; completion;
  palette tokens against the set.mm excerpt; and a scripted derivation of
  `⊢ ( ph -> ph )` from ax-1/ax-2/ax-mp driven entirely through the public API.
  That derivation is the layer's acceptance test.
- **M2 — Static render.** Blocks, token runs, empty notches, filled spans,
  collapsed chip; both viewports. Wrap stress fixture (deeply chained `wi`) at
  390px. Kill-switch: per-statement horizontal scroll if wrapping is
  irredeemable on phone.
- **M3 — Interaction.** State machine, legal-target highlighting on lift,
  rewrite flash on fill (~400ms, one CSS class; no morph animation). Playable
  milestone — stop and derive `⊢ ( ph -> ph )` by hand the moment it works.
- **M4 — Derived list, delete, demo pass at both viewports.**

M1 is fully specified and independent of every open question — start there.

## Verification

- `pnpm check` (typecheck → build → oxlint → stylelint → vitest, `&&`-chained,
  so an early failure hides the later sensors), plus `pnpm check:evidence`.
  There is no `npm` in this repo.
- Browser checks from M2 on: `agent-browser` at both marking viewports, plus a
  resize mid-interaction and a tab-through — that is what the marker does. A
  separate headless Chromium harness is work to justify, not assume.
- CI stays skipped while the repo is private, which is all week, so "green"
  means green locally and a branch-and-PR loop buys no automation. Commit small
  and straight to `main`; the process mark reads a history that grew with the
  work, and squash-merges flatten it.
- The repo goes public at the cutoff, not before, so rehearse the deploy rather
  than bring it forward: `pnpm build`, serve `dist/` under
  `/comp4020-ass1-amackay/`, and confirm no base-path 404s. Ship with enough
  margin for CI to finish.

## Out of scope (do not build)

Distinct variable conditions, RPN export, backwards reasoning, unification,
targets/levels, tutorials, .mm parsing, proof-tree display, persistence.
