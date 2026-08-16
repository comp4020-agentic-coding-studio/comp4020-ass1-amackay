# Proof blocks — implementation handoff

A drag-and-drop interface for building logical statements out of typed blocks.
Blocks are linear token sequences; some contain typed placeholders. Dropping a
piece into a placeholder substitutes it for that variable **everywhere** in the
block, and the result renders as a flat run of tokens — never as a block nested
inside a token run.

Everything below is a settled decision from a design study unless it appears
under OPEN ISSUES.

---

## 0. Domain model

Four palette blocks (internal names in parentheses; render token text exactly):

| Name | Typecode | Body tokens | Variables (slots) |
|---|---|---|---|
| wph | `wff` | `ph` | — |
| wps | `wff` | `ps` | — |
| wi | `wff` | `( ph -> ps )` | ph, ps |
| ax-1 | `⊢` | `( ph -> ( ps -> ph ) )` | ph, ps |

Node = `{ templateId, fills: { [varName]: node | null } }`.

Rules:

- **Typecode is not part of the substituted material.** When a node is dropped
  into a slot, only its *body* is substituted; its typecode cell is not carried
  into the host's token run.
- A node is **complete** when every variable has a fill and every fill is
  recursively complete.
- A node is **droppable into a slot** when it is complete *and* its typecode is
  `wff`. `⊢` blocks are therefore terminal: they can hold pieces but can never
  become one.
- All slots in this study are type `wff`, so there is exactly one slot type and
  one legality rule.
- `ax-1` has `ph` twice: filling `ph` rewrites both occurrences simultaneously.
- Nesting is unbounded; chaining wi into wi into ax-1 must work and produce long
  runs, e.g. `⊢ ( ( ph -> ps ) -> ( ps -> ( ph -> ps ) ) )`.

Slot paths are stable strings: `<cardId>/<var>[/<var>...]`, e.g. `c3/ph/ps`.
These are used as drop-target ids (`data-slot`) and as the flash key.

---

## 1. DECISIONS — interaction

**Chosen mode: DRAG.** Pointer-down lifts, the piece follows the pointer,
release resolves. The alternative tap-to-lift / tap-to-drop "carry" mode was
built, evaluated, and removed — do not implement it.

### States

- `IDLE` — nothing lifted.
- `CARRYING` — exactly one piece is lifted. Payload:
  `{ node, source, restore?, pointerX, pointerY, grabOffsetX, grabOffsetY, liftedW, liftedH }`.

`source` is one of:

- `'palette'` — a copy; the palette entry never changes.
- `<cardId>` — a whole bench card. The card stays in the bench array but renders
  `visibility: hidden` while carried (so its slot in z-order and position
  survive a cancel).
- `'slot'` — a nested block pulled out of a slot. The fill is set to `null`
  **immediately on lift**, so the host block visibly reverts to its empty
  placeholder and its conclusion row reverts to variable chips. `restore` holds
  `{ cardId, pathSegments }` for the cancel path.

`grabOffset` is the pointer position minus the lifted element's top-left at
lift time. It is used for both the ghost transform and the drop position, so the
piece never jumps under the cursor.

### Transitions

| From | Event | To | Effect |
|---|---|---|---|
| IDLE | `pointerdown` on a palette block | CARRYING | `preventDefault`, `stopPropagation`; carry a deep clone; palette unchanged |
| IDLE | `pointerdown` on a bench card (anywhere not inside a nested block) | CARRYING | carry that card; card hidden in place |
| IDLE | `pointerdown` on a nested block inside a slot | CARRYING | `stopPropagation` (host must not be dragged); clear that fill; carry the sub-node with `restore` |
| CARRYING | `pointermove` (window) | CARRYING | update pointer position; ghost follows |
| CARRYING | `pointerup` (window) over a legal slot | IDLE | fill (see below) |
| CARRYING | `pointerup` (window) over the bench, not a legal slot | IDLE | place / move (see below) |
| CARRYING | `pointerup` (window) outside the bench | IDLE | delete or no-op (see below) |
| CARRYING | `Escape` (keydown) | IDLE | cancel (see below) |

Listeners for `pointermove`, `pointerup` and `keydown` are on `window`, not on
the block — the pointer routinely leaves the block during a drag.
`touch-action: none` on every block so touch drags don't scroll the page.

### Drop resolution (on `pointerup`)

1. `document.elementFromPoint(x, y)` (the ghost has `pointer-events: none`, so
   this returns what is under the cursor, not the ghost).
2. `closest('[data-slot]')` with a non-empty value **and** the carried node is
   droppable → **fill**:
   - substitute at that path; every occurrence of that variable in the host's
     conclusion re-renders flat;
   - if `source` was a bench card, that card is consumed (removed);
   - if `source` was `'palette'` or `'slot'`, no card is removed;
   - flash all token spans produced by this fill (see §3);
   - re-measure the host card and clamp it back inside the bench (it just grew).
3. Else `closest('[data-bench]')` → **place**:
   - `source === 'palette'` or `'slot'` → create a new bench card at
     `pointer - grabOffset`, clamped;
   - `source === <cardId>` → move that card to `pointer - grabOffset`, clamped;
   - either way bump the card's z-index to the front.
4. Else (released outside the bench) → **delete**: bench-card and
   pulled-from-slot payloads are discarded. A palette-sourced payload simply
   evaporates (nothing was created). This is the only delete affordance — there
   is no delete button.

Clamp: `x ∈ [8, benchClientWidth − cardWidth − 8]`,
`y ∈ [34, benchClientHeight − cardHeight − 8]` (34 keeps clear of the "BENCH"
label). If the card is wider than the bench, `x = 8`.

### Cancel

`Escape` while carrying:

- `source === 'slot'` → put the node back into its original slot (`restore`).
- `source === <cardId>` → the card simply becomes visible again at its old
  position.
- `source === 'palette'` → nothing.

### Edge cases we hit — behave exactly like this

- **Lifting while something is already lifted:** cannot happen through the
  pointer (a drag ends on `pointerup`), but guard anyway: if `CARRYING`, ignore
  further `pointerdown` lifts rather than swapping the payload.
- **Dropping on an illegal slot** (carried node incomplete, or typecode `⊢`):
  the slot is *not* highlighted, and the drop falls through to the bench-place
  branch — i.e. the piece lands on the canvas at that point rather than
  bouncing back. Do not fill.
- **Dropping a piece onto its own host's other slot** is legal and works,
  because the pulled-out node is removed from the host at lift time.
- **Grabbing a nested block vs its host:** the nested block's handler must call
  `stopPropagation`; hit-testing is by DOM containment, not geometry.
- **Cards overlap freely.** Dropping one on top of another is allowed; the
  dropped card comes to the front.
- **A card that grows after a fill** must be re-clamped on the next frame
  (measure the real element), otherwise long expressions escape the bench.
- **Bench resize** (window resize, layout reflow) re-clamps all cards and
  re-computes the block wrap cap; drive it from a `ResizeObserver` on the bench
  plus a `resize` listener, with an initial measure on mount.

---

## 2. LAYOUT

Two regions, both children of one wrapping flex row, `gap: 14px`,
`max-width: 1240px`, centred, page padding `18px`.

- **Palette** — `flex: 1 1 240px; max-width: 308px`. Vertical column of the four
  blocks, `gap: 14px`, `align-items: flex-start`. Panel: `background #f7f8fa`,
  `border: 1px solid #d8dbe2`, `padding: 14px`, square corners. Label
  "PALETTE": IBM Plex Mono 11px, `letter-spacing: .14em`, uppercase, `#8b92a6`.
  Palette blocks are rendered at **scale 0.78** — every geometric value below is
  multiplied by 0.78 and rounded to whole px (font sizes included). Nothing else
  differs: same structure, same colours.
- **Bench** — `flex: 3 1 440px; min-height: 620px; position: relative;
  overflow: auto`. Free-form canvas: cards are absolutely positioned at the
  point they were dropped and stay there. Background: dot grid
  `radial-gradient(rgba(120,132,160,.26) 1.5px, transparent 1.6px) 0 0 / 22px 22px`
  over `#f7f8fa`. Border `1px solid #d8dbe2`, and `1px solid #7f8798` while
  carrying (the whole bench reads as a live drop target). Label "BENCH" pinned
  at `left: 14px; top: 12px`, `pointer-events: none`.

### Reflow

Because both regions are flex items with `flex-wrap: wrap` on the container:

- **Desktop (≥ ~760px content width):** palette left (≤308px), bench right,
  side by side.
- **~380px:** the bench's `440px` basis no longer fits beside the palette, so
  the bench wraps below; the palette grows to the full container width and the
  bench takes full width under it. No media queries are needed, and no
  JS-measured breakpoint.

### Scroll

- Page scrolls vertically as normal.
- Palette does not scroll; it grows to fit its four blocks.
- Bench scrolls (`overflow: auto`) — this is the escape hatch for a card that
  grew taller than the visible canvas. Cards themselves never scroll.
- Blocks never scroll horizontally; they wrap (see §4).

---

## 3. VISUAL SPEC

Visual language: white blocks, black perimeter, square corners, colour used for
*type* (typecode cells) and *identity* (variables) only.

### Tokens

```css
:root{
  /* surfaces */
  --page-bg:#eeeff2;
  --panel-bg:#f7f8fa;
  --panel-border:#d8dbe2;
  --bench-border-active:#7f8798;
  --bench-dot:rgba(120,132,160,.26);
  --block-bg:#ffffff;
  --ink:#111111;
  --label:#8b92a6;
  --meta:#6f7480;

  /* typecode cells (no border) */
  --tc-wff-bg:#dff4f1;   --tc-wff-ink:#0d4d46;
  --tc-stmt-bg:#fdf0dc;  --tc-stmt-ink:#5b3608;   /* ⊢ */

  /* variable identity */
  --ph-line:#6d4bd0; --ph-fill:rgba(109,75,208,.10); --ph-ink:#4a2ea8;
  --ps-line:#1f6fc4; --ps-fill:rgba(31,111,196,.10); --ps-ink:#14508f;

  /* interaction accent (legal slot + rewrite flash) */
  --hot-line:#9a7100;
  --hot-fill:rgba(255,203,60,.38);
  --hot-ink:#5b4200;
  --hot-ring:rgba(255,203,60,.35);
  --flash-bg:rgba(255,203,60,.85);

  /* provenance: substituted tokens tint by nesting depth, capped at 3 */
  --prov-1:rgba(17,17,17,.055);
  --prov-2:rgba(17,17,17,.110);
  --prov-3:rgba(17,17,17,.165);

  /* geometry (bench scale = 1; palette scale = .78) */
  --border-w:2px;          /* block perimeter, dashed slots */
  --radius:0;              /* everywhere */
  --pad:9px;               /* block inner padding unit */
  --tc-w:46px;             /* typecode cell width on non-final rows */
  --stem-w:55px;           /* --pad + --tc-w: the indent step per nesting level */
  --token-gap-x:7px;
  --token-gap-y:2px;
  --line-height:1.45;
  --block-max-w:560px;     /* actual cap: min(560px, benchClientWidth - 26px) */

  /* type */
  --mono:'IBM Plex Mono',ui-monospace,monospace;
  --sans:'IBM Plex Sans',system-ui,sans-serif;
  --token-size:17px;  --token-weight:600;
  --tc-size:16px;     --tc-weight:700;
  --slot-size:16px;   --slot-weight:700;

  /* motion */
  --t-slot:160ms;      /* slot border-color, ring */
  --t-slot-bg:300ms;   /* slot background */
  --t-token:450ms;     /* token background + colour, i.e. flash decay */
}
```

### Block structure (both palette and bench)

A block renders as a vertical stack of rows, one row per variable placeholder
plus one final **conclusion row**. The silhouette is a **stepped L**: a narrow
left stem (`--stem-w`) spanning the placeholder rows, joined to the full-width
conclusion row.

Row anatomy:

- **Placeholder row:** `[stem slab: --pad left padding + typecode cell]` then,
  *outside* the block perimeter, the dashed placeholder chip.
- **Conclusion row:** `[typecode cell][token cell]`, flush left (no left
  padding), full width.

Vertical rhythm: `--pad` above every row and between rows, **no padding below
the final row**; single-row blocks (wph, wps) have no top padding either.

**Perimeter borders are drawn edge-by-edge, not as per-row boxes** — a block
must read as one continuous outline with no interior horizontal rules:

- stem/placeholder slab: `border-left`, `border-right`; `border-top` only on the
  block's first row; no `border-bottom`.
- conclusion slab: `border-left`, `border-right`, `border-bottom`; `border-top`
  only when the conclusion *is* the block's first row (single-row blocks).
- the step edge (the horizontal top edge right of the stem) is a `border-top` on
  the **token cell**, so it starts exactly at the stem's outer right edge and
  runs to the block's inner right edge.
- nesting-level stem fillers (see below): `border-left` only, plus `border-top`
  on the level's first row.

Alignment rules that took several passes — get these right:

- Conclusion-row typecode cell width = `--tc-w + --pad + 2px`, because the final
  row has no left padding and its right edge must line up with the stem's
  *outer* right edge above it (`2px` border included).
- The typecode cell uses `align-self: stretch` so it is exactly as tall as the
  cell it butts against, including when the token cell wraps to 2–3 lines.
- Typecode cell and its neighbour (token cell or dashed chip) share an edge:
  `margin: 0`, no gap.
- On a block's first row the dashed chip needs `margin-top: calc(--pad + 2px)`
  (the slab's top border) so chip and typecode cell share a top edge.

### Element-by-element

**Palette block** — as above at scale 0.78 (so: token 13px, typecode 12px,
`--pad` 7px, stem 43px, border stays 2px). `cursor: grab`,
`max-width: 100%` of the palette column. No shadow. Picking one up copies it.

**Bench block** — scale 1. `position: absolute` at its drop point,
`z-index` bumped to front on each drop/move. `cursor: grab`.
`max-width: min(560px, benchClientWidth − 26px)`. No shadow.

**Token** (a symbol from the token run) — `--mono` 17px/600, `color: var(--ink)`,
`white-space: nowrap`, padding `1px 1px 2px`, no border, no radius.
Substituted tokens additionally get a provenance tint by nesting depth
(`--prov-1..3`) and padding `1px 4px 2px`. Provenance shading is always on.

**Variable chip** (an unfilled variable as it appears in a conclusion run) —
same font, padding `1px 6px 2px`, `background: var(--ph-fill)` /
`var(--ps-fill)`, `color: var(--ph-ink)` / `var(--ps-ink)`, **no border**.

**Empty slot (placeholder chip)** — sits outside the block perimeter, tinting
the bench: `border: 2px dashed var(--ph-line|--ps-line)`,
`background: var(--ph-fill|--ps-fill)`, `color: var(--ph-ink|--ps-ink)`,
`--mono` 16px/700, padding `4px 11px 5px`, `min-width: 3.4em`,
`align-self: stretch`, square corners. Label is the variable name (`ph`, `ps`).

**Typecode cell** — `--mono` 16px/700, centred, `align-self: stretch`,
`width: var(--tc-w)` (see conclusion-row exception), padding `3px 0 4px`,
`background: var(--tc-wff-bg)` / `var(--tc-stmt-bg)`, matching ink, **no
border**.

**Filled state** — indistinguishable from hand-written tokens except the
provenance tint: flat token run, no sunken/nested-block look inside the
conclusion. The *block that was dropped* does remain visible in the placeholder
row it filled (see the mechanic), but the conclusion is always flat.

**Legal-slot highlight** (while carrying a droppable piece; every empty slot on
the bench, all one type) — `border: 2px dashed var(--hot-line)`,
`background: var(--hot-fill)`, `color: var(--hot-ink)`,
`box-shadow: 0 0 0 3px var(--hot-ring)`, `cursor: copy`.
Transitions: `box-shadow`, `border-color` 160ms ease; `background-color` 300ms ease.

**Ghost** (the lifted piece) — the same block at the same scale as the bench, so
size never changes between palette, ghost and bench. `position: fixed`,
`z-index: 80`, `pointer-events: none`,
`transform: translate(pointerX − grabOffsetX, pointerY − grabOffsetY) rotate(-1.2deg)`,
`filter: drop-shadow(0 10px 18px rgba(20,26,40,.28))`. The source is hidden (bench
card) or already removed (pulled-out sub-block) so the ghost is the only copy on
screen.

**Rewrite flash** — on fill, every token span produced by that fill (matched by
slot-path prefix, so all occurrences of the variable flash together, e.g. both
`ph`s in ax-1) gets `background: var(--flash-bg)` for one frame-ish (~120ms)
and then transitions back over `--t-token` (450ms). Implement as: set flash key
→ render highlighted → clear flash key after ~120ms → CSS transition decays.

---

## 4. WRAP RULES

- The conclusion row is `display: flex; flex-wrap: nowrap` for the pair
  `[typecode cell][token cell]`, so the typecode never separates from its run.
- The token cell is `display: flex; flex-wrap: wrap; flex: 1 1 auto;
  min-width: 0`, `gap: 2px 7px` (row/column). Tokens are the flex items.
- Every token span is `white-space: nowrap`: tokens are atomic, so breaks only
  ever happen *between* tokens. There is no hyphenation, no mid-token break, no
  break inside `->`.
- Break points are therefore every inter-token gap, chosen greedily by flex —
  no attempt to keep bracket pairs together.
- Wrapped lines are **not** hanging-indented: line 2+ start at the token cell's
  left content edge, i.e. under the first token, which itself sits after the
  typecode cell. The typecode cell stretches to the full height of the wrapped
  run, so the run reads as one paragraph in a labelled cell.
- Line spacing inside a run: `line-height: 1.45` plus `2px` flex row-gap.
- Placeholder rows never wrap: the dashed chip stays beside its typecode cell
  (single flex line). A slot chip is a flex item like any token, so a slot that
  would straddle a break moves whole to the next line — a slot is never split.
- Width cap: the block's `max-width` is `min(560px, benchClientWidth − 26px)`,
  recomputed whenever the bench resizes; existing cards re-wrap and are
  re-clamped inside the bench. Cap against the **bench**, never the viewport
  (`vw` units were wrong here: a 520px block "fits" 78vw while overflowing a
  380px bench).
- Palette blocks wrap against the palette column width the same way.

---

## 5. REJECTED ALTERNATIVES

- **Carry mode (tap to lift, tap a slot to drop, Esc/tap-empty to cancel)** —
  built in full alongside drag; drag won, carry deleted.
- **Quiet typographic direction** (warm paper, thin dashed notches, no colour) —
  lost to the chunky/diagrammatic direction.
- **Chunky coloured slabs, one hue per block family** (violet/teal/blue/orange,
  white text, 3D bottom lip, rounded corners, Scratch-style yellow glow) — the
  family hues collided with per-variable identity colours; replaced by white
  blocks with a black perimeter.
- **Sunken block-in-block rendering of a filled slot inside the conclusion** —
  violates the flat-token rule; only the placeholder row shows the dropped
  block, the conclusion is always flat.
- **`ph`/`ps` text labels at the left of each placeholder row** — replaced by a
  typed `wff` cell per row, so the row advertises the *type* it expects, with
  the variable name living in the placeholder chip.
- **Bench as an ordered list of full-width rows** — replaced by a free canvas
  where blocks stay where they are dropped.
- **✕ delete button on every bench card** — replaced by drag-out-of-bench to
  delete.
- **Palette as a full-width top shelf** — needed while blocks were wide sentence
  slabs; unnecessary after the 0.78-scale palette, so the palette went back to a
  left column.
- **One bordered box per row** (three stacked rectangles for wi) — replaced by
  edge-by-edge perimeter borders forming a single L outline.
- **Rounded corners, drop shadows, block lips** — removed in the simplification
  pass; only the ghost keeps a shadow.
- **`showProvenance` / `slotLabels` toggles** — hardcoded on.
- **Viewport-relative block max-width (`78vw`)** — replaced by a bench-measured
  cap.
- **Padding after the final row / padding split before-and-after rows** —
  settled on `--pad` before each row and none after the last.

---

## 6. OPEN ISSUES

- **Phone width and nesting depth:** each nesting level indents by `--stem-w`
  (55px). At a 380px bench, 3+ levels of nesting leave very little width for the
  token run, so deep chains wrap to many short lines. Untested beyond ~3 levels
  at that width. Options not explored: shrinking the indent per level, or
  collapsing deep nested blocks to a summary.
- **Card collision:** cards can be dropped overlapping; there is no nudge,
  snap, or auto-layout. A card that grows after a fill is clamped back inside
  the bench but may end up on top of another card.
- **Pull-out placement:** pulling a block out of a slot and dropping it on the
  canvas creates a card at the pointer, which frequently lands overlapping the
  host it came from.
- **Vertical clamp uses the pre-fill height** for the initial drop; the post-fill
  re-clamp corrects it a frame later, which can look like a small jump.
- **`⊢` blocks are terminal** (type-correct: they are statements, not wffs) but
  nothing in the visual language says "this can never go in a slot" beyond the
  amber typecode cell.
- **Rapid successive drops** cut the previous rewrite flash short (single flash
  key in state).
- **No undo**, and no way to clear the bench (the clear button was removed).
- **No keyboard path** to build expressions; `Escape` only cancels a drag. No
  focus states, no ARIA roles on slots or blocks.
- **Touch not validated on device:** `touch-action: none` on blocks and a
  scrollable bench coexist in principle, but dragging a card near the bench edge
  while the bench needs to scroll has no auto-scroll behaviour.
- **Provenance tint caps at depth 3**, so nesting deeper than that is
  visually indistinguishable.
