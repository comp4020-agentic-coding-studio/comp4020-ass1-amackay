# DESIGN.md — Proof blocks

Implementation authority for this prototype: what it is, what is settled, and
what is deliberately still open. Where this file and `CLAUDE.md` disagree,
`CLAUDE.md` wins. ⟨OPEN⟩ marks decisions not yet made — stub them, don't guess.

## The idea

Metamath's verification algorithm, made directly manipulable.

In [Metamath](https://us.metamath.org/), applying a theorem means two things:
supply an expression for each floating hypothesis — this *is* the substitution,
there is no unification — and then check that each instantiated essential
hypothesis **exactly** matches an already-derived statement. This prototype
renders that as a [Scratch](https://scratch.mit.edu/)-style block interface:
fill the sockets, satisfy the locks, get the conclusion.

The visual interface exists to make every interaction valid by default, so
illegal moves are impossible and there are no error messages to decode, and to
make substitution visible as it happens.

Three things follow, and they are the design:

- **Everything in the palette is one kind of object.** A wff constructor is a
  theorem block too: `wff ( ph -> ps )` is a template with two wff-typed sockets
  and no locks, and `wff ph` is slotless. Building a wff by hand and applying an
  axiom are the same mechanic.
- **Typecodes are enforced by slot shape, not by explanation.** A wff-shaped
  notch only accepts wff-shaped pieces. No semantic understanding of typecodes
  is needed to play.
- **Exact-match locks are literal, not metaphorical.** `a.join(" ") === b.join(" ")`
  is Metamath's actual check, and the whole prototype is a dramatisation of it.

Nearest relative in interaction style: [Actema](https://www.actema.xyz/), though
the execution differs substantially. Ancestor of the mechanic: Metamath
Solitaire.

**Sandbox, not puzzle.** There is no target statement. The implicit goal is
seeing what you can reach from the given primitives. Forward reasoning and
manual assembly are the design's central untested hypothesis — the prototype
exists to find out whether assembling a derivation by hand is instructive or
merely tedious.

Audience for this iteration: colleagues who know interactive theorem provers but
not Metamath.

## Terminology (use everywhere: code, tests, commits)

- **template** — a palette JSON entry (a Metamath `$a`/`$p` with its
  hypotheses). Variable chips are slotless templates.
- **socket** — a floating-hypothesis slot. Accepts by typecode match.
- **lock** — an essential-hypothesis slot. Accepts by exact token equality.
- **chip** — a complete derivation, collapsed to its conclusion. The only thing
  that can occupy a socket or lock. Immutable.
- **key** — a chip seated in a lock (no separate type; positional term).
- **card** — a mutable block instance on the bench.
- **seated / loose** — in a slot vs free on the canvas. Visually distinct.
- **eject** — pull a chip out of a socket.
- **pop** — a key unseating because an eject changed its lock's required
  statement. It stays where it is, restyled as loose.
- **slot** — generic: socket or lock.

## Ground rules

- **Stack is the template as it ships**: Vite + TypeScript + plain CSS, no
  framework, no Tailwind. Static, client-side, no persistence.
- **Marking viewports are exactly 390×844 and 1920×1080.** Keyboard-operable,
  resize-robust.
- **The logic layer is pure TypeScript with zero DOM imports** — enforced by
  `src/logic/purity.test.ts`. The interaction's state machine
  (`src/ui/workspace.ts`) holds the same line, enforced by its own test: a
  pointer bug and a state bug must never be confusable.
- **The core interaction is marked in the DOM** — `data-core-interaction` on the
  control the visitor operates, `data-core-output` on the region that changes;
  `spec/assignment-1.test.ts` requires tab-reachability and reads the *built*
  page, so the attribute has to be in `index.html` and not only added by script.
- No .mm parsing in the shipped site. Palette content is hand-authored JSON,
  `$d`-free, tested byte-for-byte against `reference/set.mm-propcalc.mm` (itself
  verified by `reference/mmverify.py`).

## Core model

**Invariant: anything inside a slot is complete.** Slots hold chips — finished,
collapsed derivations — never partial blocks. Construction and deconstruction
are inverse: seat and eject in opposite order. The proof tree is the chip
structure itself; you see it only by manually taking one apart.

The types are in `src/logic/types.ts` and the operations in
`src/logic/index.ts`. What the code cannot say for itself:

- **A chip *is* its own provenance.** There is no parallel proof record to keep
  in step with the tokens, because the tokens are recomputed from the structure
  by `conclusionTokens`. Recompute, never cache.
- **Substitution is simultaneous**, because recursion only ever runs through
  complete chips. There is no splice ordering to get wrong, and no way to
  half-substitute. On ax-1, `ph := ps` with `ps := ph` gives
  `( ps -> ( ph -> ps ) )`; splicing one variable at a time would give
  `( ph -> ( ph -> ph ) )`.
- **A fill contributes `tokens.slice(1)`** — everything after its typecode.
  Splicing a wff in whole would strand its `wff` token mid-statement, and the
  slice is also why the empty wff (`["wff"]`, which MIU declares as `we`)
  substitutes to nothing at all.
- **Locks gate on all-sockets-filled**, because until then the lock still
  contains variables and there is nothing definite to match against — not "no
  match", but "not yet a question".
- **Eject pops a key when the raw lock expression *mentions* the ejected
  variable**, literally, even when the rendered picture happens to be unchanged.
  A key stands for "this derivation satisfies that hypothesis *under these
  fills*", so when a fill it depended on goes, keeping the key would keep it on
  a coincidence. It also makes the gesture depend only on the template: the same
  eject on two structurally identical cards pops the same locks.
- **The pure layer has no notion of collapse, position, or flash.** `collapsed`
  and `x/y/z` live on `Card` because a card is what the bench draws, but nothing
  in `src/logic` reads them.

The layer's acceptance test is a scripted derivation of `⊢ ( ph -> ph )` from
ax-1, ax-2 and ax-mp through the public API — set.mm's own idALT route, so it
has an external referent rather than being invented here.

## Interaction

- **Palette → bench copies; bench → anywhere moves.** Dropping a bench card into
  a slot consumes the card: it *becomes* the seated chip. Palette originals are
  permanent. A consequence worth knowing before it surprises you: anything used
  twice has to be built twice.
- **Droppability**: a thing can be lifted *for seating* iff it is a chip — a
  complete **collapsed** derivation. A complete card the visitor has expanded is
  one they are taking apart, not one they are about to use. Incomplete cards drag
  to move on the canvas but never highlight a slot.
- **Legal targets light up together** on lift, so "where can this go" is answered
  by looking rather than by trying.
- **Auto-collapse**: when a card completes, flash the rewritten spans first
  (~120ms hold, ~450ms decay), *then* collapse — sequenced, never simultaneous,
  so the visitor sees what changed before the card folds up and hides it.
- **Uncollapse**: a loose complete card expands and re-collapses via a caret
  appended after its conclusion run — inside the block, sized like a token, so it
  wraps with the run instead of floating over a corner whose shape keeps
  changing. A chip seated in another card's slot cannot be uncollapsed in
  place — eject it first.
- **Eject**: pointerdown on a seated chip lifts it out, clearing the fill *on
  lift* so the host visibly reverts as you pull. Esc restores it, along with any
  keys that popped — which is the eject-and-reseat-is-identity property used in
  anger.
- **Drop resolution order**, on release: a legal slot, then the delete target,
  then the bench, then nothing (released clean off the bench, which discards).
  An *illegal* slot is not highlighted and falls through to the bench branch —
  the piece lands on the canvas where it was dropped rather than bouncing back.
- **Overlap-match is a rendered metaphor, not a hit test.** Legality is the logic
  layer; resolution is `elementFromPoint` → `[data-slot]` → `canSeat*`. Never
  implement geometric overlap matching.
- **Delete**: release outside the bench, or onto the target pinned in the corner
  while something is carried. No undo (accepted for the prototype).
- **Keyboard adapter**: the same state machine, a different event→transition
  mapping. Enter on a palette entry **places a copy** on the bench and focuses
  it; from the bench, Enter on a chip lifts, Tab cycles legal slots, Enter seats,
  Esc cancels; Enter on a seated chip ejects it back onto the bench. Palette
  entries place rather than lift because most of them are incomplete templates
  and lifting one would do nothing — a keyboard user could never get a `wi` card
  onto the bench, and the whole derivation would be pointer-only.
- Pointer listeners for move, up and Escape go on `window`, not on the block: the
  pointer routinely leaves the block mid-drag, and a release outside the bench is
  a real gesture rather than a lost one.
- Cards are clamped inside the bench, re-clamped when it resizes, and z-bumped to
  the front on each drop. Resize is tested *while a piece is lifted*.

## Rendering

- **The canvas is the page.** The bench fills the viewport edge to edge, nothing
  scrolls but the tray's block list, and there is no chrome band above it: the
  only visible text the artefact carries is its `h1`, in the tray's head. The
  `nav` landmark and the regions' names are in the document but off the screen,
  because `spec/invariants.test.ts` requires a nav and exactly one `h1` on every
  built page and the canvas has no room to spend on either.
- **The palette is a tray floating over the canvas** — a drawer flush to the left
  edge at ≥700px, a band across the top below that, sized so palette and bench
  are visible together at 390×844. It carries a grip mark on its inner edge; the
  gesture that would use it is not built. The dot grid runs underneath it: the
  tray floats over a continuous surface rather than sitting beside a shorter one.
- **The tray's footprint and the placement area are two different things.** Cards
  are clamped to the canvas *minus* the tray, so nothing can ever land where the
  tray would hide it. That is `.bench-cards` being inset in CSS and nothing more:
  it is already the element `capBlocks`, `reclamp` and `benchPoint` measure, so
  no code anywhere has a notion of a tray. Releasing a piece over the tray
  discards it, exactly as releasing it over the palette always did.
- **Block shape**: a card is a vertical stack of left-aligned rows — one per
  socket, one per lock, then the conclusion. **Each row is shrink-to-fit**, so
  the silhouette is a staircase that changes as slots fill. Collapsed cards
  render the conclusion row only, which still wraps: "one-liner" means one row,
  not one visual line.
- **Socket row**: the typecode the row expects, then a dashed typecode-shaped
  notch. A seated chip leads with its own typecode cell, which `canSeatSocket`
  guarantees is the same typecode — the fit is the thing you see. An
  identity-coloured edge marks where the socket stops and its contents start.
- **Lock row**: a dashed full-silhouette **picture** of the required statement,
  drawn with the same token renderer, variable chips where sockets are unfilled.
  Inert until all sockets are filled; rewrites live as they fill; then
  highlightable. A seated key overlays the picture.
- **Outline component**: perimeters are never drawn edge-by-edge per row. Rows
  lay out in a grid and each block outline is one absolutely-positioned SVG
  `<path>` whose staircase geometry comes from measured row rects. One
  `BlockOutline` serves three uses: card perimeter (solid), lock picture
  (dashed), legal-target highlight (hot dashed). It is drawn *over* the rows —
  they are opaque, and each carries the block background, so the union of the
  rows is the staircase and the outline needs no fill.
- **Wrap**: every token is its own element with `white-space: nowrap`, so the
  only break points are the gaps between tokens. No hyphenation, no break inside
  `->`, and a slot chip moves whole to the next line rather than splitting.
  Wrapped lines are not hanging-indented. Blocks are capped against the **bench**
  and never the viewport.
- **Ghost**: unrotated, bench scale, translucent — the visitor has to be able to
  compare the carried chip against the slot it is over.
- **Seated vs loose tint**: seated chips get a distinct background; a popped key
  visibly becomes loose without moving.
- **Rewrite flash**: on any seat, every token span that seat produced flashes,
  keyed by the slot; all occurrences of a variable flash together, because
  ax-1's two `ph`s are one substitution and not two.

## Palette JSON

`src/palettes/<name>.json` — `{ variables, templates }`, imported as raw text
(Vite `?raw`) rather than fetched from `public/`, so page init stays synchronous
and the validator still runs on the exact shipped bytes. Shape-checked at load by
a plain TS assert (no zod); a malformed palette throws loudly at startup, because
a quiet partial load would surface much later as a block that mysteriously
accepts nothing.

- Prototype palette: variable chips, `wn`, `wi`, `ax-1`, `ax-2`, `ax-3`, `ax-mp`
  (the first template with a lock, and so the one that turns a pile of wffs into
  a derivation).
- Design-study palette: `ph`, `ps`, `wi`, `ax-1` — kept as the smaller fixture.

## Notation

`src/notation/althtmldef.json` — `{ token: glyph }`, every `althtmldef` in
set.mm's `$( $t … $)` typesetting block, extracted by
`scripts/extract-notation.py`. All ~1,800 of them, not only the propositional
ones, so a different template set needs no second extraction.

**Rendering only.** The model keeps set.mm's ASCII tokens: substitution, the
lock's exact-equality check and the palette JSON are all unchanged, and nothing
under `src/logic` imports this. Token spans carry `data-token` with the ASCII, so
slot paths, identity colours and the rewrite flash still address tokens by what
the database calls them. An unmapped token renders as itself.

`--mono` names math-capable fallbacks because set.mm writes variables in the
Mathematical Alphanumeric Symbols block (`ph` is U+1D711, not Greek φ), which
most monospace faces do not cover.

## Rejected

Built or specified, then dropped. Recorded so they are not re-proposed.

- **Carry mode** (tap to lift, tap a slot to drop) — built in full alongside
  drag in the design study; drag won. It returned as the keyboard adapter.
- **A flat model** — `fills: Map<string, Expr>` with a parallel `Provenance`
  tree. Replaced by the recursive chip: two structures that had to be kept in
  step became one that cannot disagree with itself.
- **Nested blocks rendered expanded inside socket rows**, with a per-level stem
  indent and provenance tints by depth. Seated chips are collapsed one-liners,
  so there is no depth — which also dissolved the deep-nesting phone concern.
- **Chunky coloured slabs, one hue per block family** — the family hues collided
  with per-variable identity colours. Replaced by white blocks with a black
  perimeter, colour reserved for *type* and *identity*.
- **Quiet typographic direction** (warm paper, thin notches, no colour) — lost to
  the chunky, diagrammatic direction.
- **One bordered box per row** — replaced by the single measured SVG outline.
  Border arithmetic per edge broke every time a row changed width.
- **Bench as an ordered list of full-width rows** — replaced by a free canvas.
- **Two bordered panels side by side in a centred 1240px column** — replaced by
  the full-viewport canvas with the tray over it. The column put the bench below
  the fold at 390×844 (it started at y=1036 of a 1475px page), so palette and
  bench were never on screen together and `touch-action: none` meant a drag could
  not scroll to reach it. Page height was set by the palette's length, so the
  bench scrolled away whenever the palette was taller than the window.
- **`✕` delete button on every card** — replaced by drag-out-of-bench, and then
  by the corner delete target.
- **Viewport-relative block max-width (`78vw`)** — a 520px block "fits" 78vw
  while overflowing a 380px bench. Capped against the bench instead.
- **Rotated, opaque, heavy-shadow ghost** — you cannot compare a rotated ghost
  against the slot underneath it.
- **`showProvenance` / `slotLabels` toggles** — hardcoded on.
- **"⊢ blocks are terminal"** — a design-study artifact. Locks accept ⊢ chips;
  that is what ax-mp is for.

## Known issues (accepted)

- **Card collision.** Cards can be dropped overlapping; there is no nudge, snap
  or auto-layout. A card that grows after a fill is clamped back inside the bench
  but may end up on top of another.
- **Eject placement.** An ejected chip lands near the host it came from, which
  frequently overlaps it.
- **The post-fill re-clamp runs a beat late**, so a card that grew can jump
  slightly.
- **Rapid successive seats** cut the previous flash short — there is one flash
  key in the render state.
- **No undo**, and no way to clear the bench.
- **Keyboard card-moving on the canvas** is not implemented. The keyboard covers
  place, lift, seat, eject and cancel — the fill path — which is enough to derive
  `⊢ ( ph -> ph )` with no pointer.
- **Touch is not validated on a device.** `touch-action: none` on blocks and a
  scrollable bench coexist in principle, but dragging near a bench edge has no
  auto-scroll.
- **Math glyphs have no `aria-label`.** `data-token` keeps the ASCII in the DOM,
  but what a screen reader makes of U+1D711 is untested.

## ⟨OPEN⟩ Design decisions

- **Derived-list / palette growth** — completed chips currently just live on the
  bench. Whether there is a "keep to palette" gesture, a starter/derived palette
  split, and its naming: undecided. Don't build; don't foreclose (chips are
  immutable and self-contained, so any future mechanism is additive).
- **Page framing** — the title sits in the tray's head; the sentence or two and
  the one ignorable invitation are still to write. Prose, not architecture. Due
  before shipping.
- **Showing and hiding the tray** — the drawer is drawn as something that could
  be put away, and nothing puts it away. Whether the gesture exists, and whether
  the canvas reclaims the space when it does: undecided.

## Status

- **Logic layer** — complete. Recursive chip/card model, seat/eject/pop,
  freeze/thaw, the palette validator, and the `⊢ ( ph -> ph )` acceptance test.
- **Render** — complete. Rows, notches, lock pictures, seated/loose, collapsed
  cards, `BlockOutline`, wrapping at both viewports, set.mm notation.
- **Interaction** — complete. Drag and keyboard adapters over one state machine,
  legal-target highlighting, flash-then-collapse, delete target, resize
  mid-carry.
- **Remaining** — framing prose, `PROCESS.md`, `reflections/assignment-1.md`, a
  demo pass at both viewports, and the deploy rehearsal.

## Verification

- `pnpm check` (typecheck → build → oxlint → stylelint → vitest), plus
  `pnpm check:evidence`. No `npm` in this repo.
- Browser checks with `agent-browser` at both marking viewports, plus a resize
  mid-interaction (including mid-carry) and a tab-through.
- `scripts/derive-id.sh` drives the derivation through real pointer gestures, up
  to and including the exact-match lock seat.
- Commit small and straight to `main`; CI stays skipped while private; the repo
  goes public at the cutoff. Rehearse the deploy: `pnpm build`, serve `dist/`
  under `/comp4020-ass1-amackay/`, confirm no base-path 404s.

## Out of scope (do not build)

Distinct variable conditions, RPN export, backwards reasoning, unification,
targets, levels, game flow, tutorials, .mm parsing in the browser,
whole-proof-tree display, undo, persistence, infinite canvas, panning, zooming.
