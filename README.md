# Proof blocks

A browser prototype where you build Metamath derivations by dragging blocks
together. No text entry, no syntax errors, forward reasoning only.

In [Metamath](https://us.metamath.org/), applying a theorem means supplying an
expression for each floating hypothesis — that *is* the substitution, there is no
unification — and then checking that each instantiated essential hypothesis
**exactly** matches something already derived. This renders that as a
[Scratch](https://scratch.mit.edu/)-style block interface: fill the sockets,
satisfy the locks, get the conclusion. Illegal moves are impossible, so there are
no error messages to decode.

Built for ANU COMP4020 (Agentic Coding Studio)
[Assignment 1](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/assignment-1/).

## Running it

```sh
mise install    # the Node and pnpm versions this repo is tested against
pnpm install
pnpm dev        # local dev server
pnpm check      # typecheck, build, lint, and the test suite
pnpm build      # produce dist/, which is what deploys
```

Drag a `wi` block onto the bench, drop `𝜑` chips into both of its sockets, and it
collapses into `wff ( 𝜑 → 𝜑 )` — a chip you can now drop into something else.
The whole thing is keyboard-operable too: Enter on a palette block places a copy,
Enter on a chip lifts it, Tab cycles the slots it may legally fill, Enter seats
it.

`bash scripts/derive-id.sh` drives the browser through a real derivation, up to
the moment ax-mp's lock accepts an exact match.

## How it is put together

| | |
|---|---|
| `src/logic/` | the model: templates, chips, cards, substitution, the lock check. Pure TypeScript, zero DOM — a test enforces it |
| `src/ui/workspace.ts` | the interaction as a state machine. Also zero DOM, for the same reason |
| `src/ui/` | rendering, and the pointer and keyboard adapters over that machine |
| `src/palettes/` | the block sets, hand-authored, checked byte-for-byte against set.mm |
| `src/notation/` | token → glyph, extracted from set.mm's own typesetting block |
| `reference/` | vendored Metamath files, so the palette can be checked against its source rather than trusted |
| `spec/` | what the deployed page must do |

`DESIGN.md` is the implementation authority — what is settled, what is
deliberately open, and what was tried and rejected. `CLAUDE.md` is the harness
the coding agent works against. `PROCESS.md` is the reading guide to how the work
came together.

## Where the Metamath comes from

`reference/set.mm-propcalc.mm` is the first 14,541 lines of
[set.mm](https://github.com/metamath/set.mm) (CC0), byte-verbatim: everything
through propositional calculus, `$d`-free, and verifiable standalone by the
`mmverify.py` beside it. The palettes are hand-authored JSON, and a test reads
the statements back out of that file and compares them, so "matches set.mm
exactly" is a sensor rather than a claim. The glyphs come from the same
database's `althtmldef` lines. See `reference/README.md`.
