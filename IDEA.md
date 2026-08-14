# IDEA: Scratch-style Metamath proof sandbox

A browser prototype where the user builds Metamath(-isomorphic) derivations by
dragging and assembling statement blocks — no text entry, no syntax errors,
forward reasoning only. Built for ANU COMP4020 (Agentic Coding Studio)
[Assignment 1](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/assignment-1/),
with possible extension at the later
[game crit](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/).

## The one idea

Metamath's verification algorithm, made directly manipulable. In Metamath
([spec/site](https://us.metamath.org/)), applying a theorem means: supply an
expression for each floating hypothesis (this *is* the substitution — no
unification), then check that each instantiated essential hypothesis exactly
matches an already-derived statement. The prototype renders this as a
Scratch-style ([scratch.mit.edu](https://scratch.mit.edu/)) block interface:
fill the parameter slots, satisfy the lock slots, get the conclusion.

The visual interface exists to make all interactions valid by default
(illegal moves are impossible, so there are no error messages to decode) and
to make substitution intuitively visible through animation.

Closest existing relative in interaction style: [Actema](https://www.actema.xyz/)
(drag-and-drop proof building), though the execution differs substantially.
Ancestor of the mechanic: Metamath Solitaire.

## Blocks

Everything in the palette is one kind of object: a theorem block with three
vertically stacked parts, any of which may be empty —

1. **Floating hypotheses** — parameter slots. Filling one immediately rewrites
   that variable throughout the block's displayed statements.
2. **Essential hypotheses** — lock slots. Only accept an exact match (string
   equality), and only become fillable once all floats are filled.
3. **Conclusion** — the derived statement, usable once all hypotheses are
   satisfied. A completed block collapses down to just its conclusion.

Uniformity: wff constructors are theorem blocks too (`wff ( ph -> ps )` is a
block with two wff-typed float slots and no locks; `wff ph` is slotless). So
"building up a wff by hand" and "applying an axiom" are the same mechanic.

Typecodes (wff, |-, setvar, class) are enforced by slot *shape*, not
explanation: a wff-shaped notch only accepts wff-shaped pieces. No semantic
understanding of typecodes is required to play.

## Interface

- A **palette** holding the available statement blocks, and a free-build
  **bench** (working name) that blocks are dragged onto.
- Lifting a piece highlights every slot that would currently accept it
  (typecode match for float slots, equality match for lock slots).
- Statements render as horizontal token runs that wrap — linear, like
  Metamath's own token strings — not 2D expression trees.
- Sandbox, not puzzle: no target statement. The implicit goal is seeing what
  you can reach from the given primitives.
- Proofs are transient (LCF-style): you end up with valid statements, not a
  displayed proof tree. Provenance of each derived statement is kept
  internally (enables un-collapse or export later) but not surfaced.

**Open question — copy/move semantics.** Current candidate: the palette has
two halves. A *starter* half holds the primitives (undeletable); a *derived*
half accumulates statements the user has produced (deletable). Palette → bench
copies; bench → palette moves (removes the bench copy, adds to derived list) —
including for half-filled blocks. A block completed on the bench
auto-collapses and perhaps auto-moves to the derived list. Details and naming
not settled.

## Scope

**In:** the single UI mechanic above, thoroughly tested and refined; a small
hand-authored palette shipped as static JSON (roughly: variable blocks, wn,
wi, ax-1, ax-2, ax-3, ax-mp — ax-mp being the first block with lock slots);
`$d`-free content only.

**Out (for this prototype):** distinct variable conditions, RPN proof format,
backwards reasoning, auto-unification, targets/levels/game flow,
tutorialisation, standalone explainer polish, parsing .mm in the browser.
The prototype may need an over-the-shoulder explanation when demoed; a proper
standalone explainer is a possible later stage.

**Audience for this iteration:** colleagues who know ITPs but not Metamath.

## Why these choices

- **Forward reasoning, manual assembly:** simplest to implement, most
  directly shows what substitution *is*. Treated as the design's central
  untested hypothesis — the prototype exists to find out whether manual
  assembly is instructive or tedious.
- **Exact-match locks:** literal, not metaphorical — this is Metamath's
  actual check, and the cheapest one to implement.
- **Curated palette per sandbox:** small fixed block sets, not all of set.mm
  (both a scope constraint and an empirically supported design guardrail).
