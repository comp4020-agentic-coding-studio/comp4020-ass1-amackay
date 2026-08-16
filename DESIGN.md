# DESIGN.md — Proof blocks (working title)

Implementation authority. Concept and rationale live in IDEA.md; the design
study's visual/layout detail lives in HANDOFF.md. Where this file and
`CLAUDE.md` disagree, `CLAUDE.md` wins. Where this file and HANDOFF.md
disagree, **this file wins** — see "Superseded from HANDOFF.md" below.
⟨OPEN⟩ marks decisions not yet made — stub them, don't guess.

## What changed in this revision (read first)

The core model is now **recursive** (a tree of complete derivations), replacing
the flat `fills: Map<string, Expr>` model that M1 implemented. The interaction
semantics are settled and richer: collapse/uncollapse, eject, pop, a delete
target, and a keyboard adapter. Vocabulary is also new (below); rename
consistently, including in the M1 code.

## Terminology (use everywhere: code, tests, commits)

- **template** — a palette JSON entry (a Metamath `$a`/`$p` with its
  hypotheses). Variable chips are slotless templates.
- **socket** — a floating-hypothesis slot. Accepts by typecode match.
- **lock** — an essential-hypothesis slot. Accepts by exact token equality.
- **chip** — a complete derivation, collapsed to its conclusion. The only
  thing that can occupy a socket or lock. Immutable.
- **key** — a chip seated in a lock (no separate type; positional term).
- **card** — a mutable block instance on the bench.
- **seated / loose** — in a slot vs free on the canvas. Visually distinct
  (background tint).
- **eject** — pull a chip out of a socket.
- **pop** — a key unseating because an eject changed its lock's required
  statement. It stays where it is, restyled as loose.
- **slot** — generic: socket or lock.

## Ground rules (unchanged)

- **Stack is the template as it ships**: Vite + TypeScript + plain CSS, no
  framework, no Tailwind. Static, client-side, no persistence.
- **Marking viewports are exactly 390×844 and 1920×1080.** Keyboard-operable,
  resize-robust.
- **The logic layer is pure TypeScript with zero DOM imports.** UI is a thin
  shell over it.
- **The core interaction is marked in the DOM** — `data-core-interaction` on
  the control the visitor operates, `data-core-output` on the region that
  changes; `spec/assignment-1.test.ts` requires tab-reachability.
- No .mm parsing. Palette content is hand-authored JSON, `$d`-free, tested
  byte-for-byte against `reference/set.mm-propcalc.mm` (verified by
  `reference/mmverify.py`).

## Core model

**Invariant: anything inside a slot is complete.** Slots hold chips —
finished, collapsed derivations — never partial blocks. Construction and
deconstruction are inverse: seat/eject in opposite order. The proof tree is
the chip structure itself; you see it only by manually deconstructing.

```ts
type Token = string;                    // "(", "ph", "->", ...
type Typecode = "wff" | "setvar" | "class" | "|-";
type Expression = Token[];              // tokens[0] is always the typecode

interface Template {                    // palette JSON entry
  label: string;                        // e.g. "ax-1"
  sockets: { var: string; typecode: Typecode }[];  // MM floating hyps, $f order
  locks: Expression[];                  // MM essential hyps
  conclusion: Expression;
}

interface Chip {                        // complete derivation; immutable
  template: Template;
  fills: Record<string, Chip>;          // one per socket
  keys: Chip[];                         // one per lock
}
// Chip IS the provenance — there is no separate Provenance type.

interface Card {                        // the only mutable thing
  id: string;
  template: Template;
  fills: Partial<Record<string, Chip>>;
  keys: (Chip | null)[];
  collapsed: boolean;
  x: number; y: number; z: number;      // bench position, stacking
}
```

### Operations (logic layer)

- `conclusionTokens(chip): Expression` — one pass over
  `template.conclusion`: a socket variable becomes
  `conclusionTokens(fills[var]).slice(1)` (drop the typecode token);
  everything else copies through. Recursion is only ever through complete
  chips, so simultaneity is structural — there is no splice ordering to get
  wrong. Recompute, don't cache.
- `instantiatedLocks(card): Expression[]` — each lock under current fills;
  unfilled socket variables pass through as variable tokens (these render as
  the lock "pictures").
- `canSeatSocket(card, var, chip)` — socket unfilled ∧
  `conclusionTokens(chip)[0]` equals the socket's typecode.
- `canSeatLock(card, i, chip)` — all sockets filled ∧ lock `i` unfilled ∧
  `a.join(" ") === b.join(" ")` between `conclusionTokens(chip)` and
  instantiated lock `i`. Nothing cleverer; the literalness is the point.
- `isComplete(card)` — all sockets and locks filled.
- `freeze(card): Chip` / `thaw(chip): Card` — freeze on completion; thaw
  produces a complete, collapsed card (used when a chip is ejected onto the
  bench or popped). Round-trip must be identity on the derivation.
- `eject(card, var): { card: Card; chip: Chip; popped: { lockIndex: number;
  chip: Chip }[] }` — clears the fill and unseats every key whose lock
  mentions `var` (its picture changed). Keys in locks not mentioning `var`
  stay seated: the all-sockets-filled gate applies to *seating*, not
  retention.

The pure layer has no notion of collapse, position, or flash — those are UI
state (`collapsed`, `x/y/z` live on Card but only the UI reads them).

## Interaction semantics (settled)

- **Palette → bench copies; bench → anywhere moves.** Dropping a bench card
  into a slot consumes the card (it becomes the seated chip). Palette
  originals are permanent.
- **Droppability**: a thing can be lifted *for seating* iff it is a chip — a
  complete collapsed derivation (palette variable chips are trivially chips).
  Incomplete cards can be dragged to move on the canvas but never highlight
  slots.
- **Auto-collapse**: when a card completes, flash the rewritten spans first
  (~450ms decay), *then* collapse — sequenced, never simultaneous. The
  collapsed card stays on the bench; nothing is auto-added to the palette.
- **Uncollapse**: a loose complete card can be expanded/re-collapsed via a
  small toggle affordance (pointerdown on the toggle must not lift the card).
  A chip seated in another card's slot cannot be uncollapsed in place — eject
  it first.
- **Uncollapsed complete cards are mutable**: ejecting a fill un-completes
  the card (it stops being seatable until refilled). "Locked closed" applies
  to a chip while seated in someone else's slot, not to the slots of a card
  expanded on the bench.
- **Eject**: pointerdown on a seated chip lifts it out (fill cleared on
  lift; Esc restores). Ejecting may **pop** keys (see model): popped keys
  become loose cards (collapsed, complete) at their current visual position,
  restyled loose.
- **Delete**: release outside the bench, **or** onto a small delete icon
  pinned in a screen corner, shown only while something is carried, treated
  as a drop target branch before bench-place in the resolution order. No
  undo (accepted for the prototype).
- **Keyboard adapter**: the deleted "carry" mode from the design study is the
  keyboard path — focus a chip, Enter lifts, Tab cycles legal slots, Enter
  seats, Esc cancels. Same state machine as drag; only the event→transition
  mapping differs. Scope: the *fill* path only; keyboard card-moving on the
  canvas is a known issue, not a requirement.
- Drop resolution, clamping, z-bump, window-level listeners, resize
  re-clamping: as HANDOFF.md §1, with the delete-target branch added. Test
  resize *while a piece is lifted*.

## Rendering

- **Block shape**: a card is a vertical stack of left-aligned rows — one per
  socket, one per lock, then the conclusion row. **Each row is
  shrink-to-fit** (width: max-content, capped by the block max-width), so the
  silhouette is a staircase that changes as slots fill. Collapsed cards
  render the conclusion row only (which still wraps — "one-liner" means one
  row, not one visual line).
- **Socket row**: typecode cell + a dashed typecode-shaped notch. A seated
  chip renders as its (collapsed) conclusion row seated so that its typecode
  cell exactly overlaps the notch — the L-shape metaphor: only the typecode
  part must "fit".
- **Lock row**: a dashed full-silhouette **picture** of the required
  statement — the instantiated lock rendered with the same token renderer,
  dashed outline, variable chips where sockets are unfilled. Inert until all
  sockets are filled; it rewrites live as sockets fill, then becomes
  hot-highlightable. A seated key overlays the picture exactly.
- **Overlap-match is a rendered metaphor, not a hit test.** Legality is the
  logic layer; drop resolution is `elementFromPoint` → slot → `canSeat*`; on
  success the chip *snaps* to the seat position. Never implement geometric
  overlap matching.
- **Ghost**: unrotated, scale 1, opacity ≈ 0.65, minimal shadow — the user
  must be able to visually compare the carried chip against the slot it's
  over. (Supersedes HANDOFF.md's rotated opaque ghost.) Optional polish:
  snap-preview into the seat position while hovering a legal slot.
- **Seated vs loose tint**: seated chips get a distinct background from loose
  cards; a popped key visibly changes to loose without moving.
- **Outline component**: do not draw perimeters edge-by-edge per row. Lay out
  rows with CSS grid; draw each block outline as one absolutely-positioned
  SVG `<path>` whose staircase geometry derives from measured row rects
  (ResizeObserver). One `BlockOutline` component serves three uses: card
  perimeter (solid), lock picture (dashed), legal-target highlight (hot
  dashed). This replaces all of HANDOFF.md's border arithmetic.
- **Rewrite flash**: on any seat, every token span produced by it flashes
  (~120ms hold, 450ms decay), keyed by slot path; all occurrences of a
  variable flash together. Colours, type, motion tokens: HANDOFF.md §3 where
  not superseded here.
- Since seated chips are collapsed one-liners, there is **no per-level
  indent** — HANDOFF.md's deep-nesting phone concern is largely dissolved.
  Wrap rules for token runs: HANDOFF.md §4 unchanged.

## Superseded from HANDOFF.md (do not implement)

- Nested blocks rendered expanded inside placeholder rows; per-level stem
  indent (`--stem-w` × depth); provenance-by-depth tints beyond flat spans.
- Pull-out of *incomplete* sub-blocks; `restore`-based carry of partial state
  beyond the Esc path described above.
- "⊢ blocks are terminal" (study artifact — locks accept ⊢ chips).
- Rotated, opaque, heavy-shadow ghost.
- "No delete button" (the corner delete target exists now).
- Carry mode deletion (it returns as the keyboard adapter).

## Palette JSON

`src/palettes/<name>.json` — `{ variables, templates }`, imported as raw text
(Vite `?raw`) rather than fetched from `public/`, so page init stays synchronous
and the validator still runs on the exact shipped bytes. Shape-checked at load
by a plain TS assert (no zod). Field names use the new vocabulary
(`sockets`, `locks`, `conclusion`); token content remains a byte-faithful
transcription of set.mm, tested against `reference/set.mm-propcalc.mm`.

- Design-study palette: `ph`, `ps`, `wi`, `ax-1`.
- Prototype palette: variable chips, `wn`, `wi`, `ax-1`, `ax-2`, `ax-3`,
  `ax-mp` (first template with a lock).

## ⟨OPEN⟩ Design decisions

- **Derived-list / palette growth** — completed chips currently just live on
  the bench. Whether there's a "keep to palette" gesture, a starter/derived
  palette split, and its naming: undecided. Don't build; don't foreclose
  (chips are immutable and self-contained, so any future mechanism is
  additive).
- **Uncollapse affordance** — a toggle must exist (see semantics); its exact
  form (corner icon, double-tap, …) is a design iteration.
- **Page framing** — title + a sentence or two + one ignorable invitation,
  prose not architecture; decide before M4.
- **Visual refinements** — the handoff's open issues (card collision, clamp
  jump, pull-out overlap placement, rapid-flash truncation, drag auto-scroll
  near bench edges) are accepted known issues unless one becomes blocking.

## Build order

- **M1R — rework logic layer** (blocks everything). Chip/Card recursive
  model, new vocabulary throughout, operations above. Tests: keep the M1
  suite's intent (multi-occurrence, typecode rejection, lock near-miss
  one-token diff, gating, palette-vs-set.mm) and add: freeze/thaw round-trip;
  eject-then-reseat identity; pop reconciliation (ejecting a socket pops
  exactly the keys whose locks mention it); and the scripted
  `⊢ ( ph -> ph )` derivation from ax-1/ax-2/ax-mp through the public API —
  still the layer's acceptance test.
- **M2 — static render.** Rows, notches, lock pictures (inert and live),
  seated/loose tints, collapsed cards, `BlockOutline`; both viewports; wrap
  stress fixture (deeply chained `wi`) at 390px. Kill-switch: per-statement
  horizontal scroll if wrapping is irredeemable on phone.
- **M3 — interaction.** Drag state machine + keyboard adapter, seat / eject /
  pop, delete target, legal-target highlighting, flash-then-collapse
  sequencing, resize-while-lifted. Playable milestone — stop and derive
  `⊢ ( ph -> ph )` by hand the moment it works.
- **M4 — framing prose, demo pass at both viewports, deploy rehearsal.**

## Verification (unchanged)

- `pnpm check` (typecheck → build → oxlint → stylelint → vitest), plus
  `pnpm check:evidence`. No `npm` in this repo.
- Browser checks from M2 on: `agent-browser` at both marking viewports, plus
  a resize mid-interaction (including mid-carry) and a tab-through.
- Commit small and straight to `main`; CI stays skipped while private; the
  repo goes public at the cutoff. Rehearse the deploy: `pnpm build`, serve
  `dist/` under `/comp4020-ass1-amackay/`, confirm no base-path 404s.

## Out of scope (do not build)

Distinct variable conditions, RPN export, backwards reasoning, unification,
targets/levels, tutorials, .mm parsing, whole-proof-tree display, undo,
persistence, infinite canvas / panning / zooming.