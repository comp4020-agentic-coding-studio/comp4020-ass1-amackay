# Process overview

## What I built

**Proof blocks** — a work-in-progress prototype that makes proof logic something
you can handle, rather than something you type.

It builds on [Metamath](https://us.metamath.org/)
([Wikipedia](https://en.wikipedia.org/wiki/Metamath)), a theorem prover with an
unusually small idea at its centre: every proof step is pure symbol
substitution, checkable without knowing what any of the symbols mean. Its main
library, `set.mm`, derives most of mathematics that way from a handful of axioms
— which is what makes it worth a direct-manipulation interface: the rule for
"is this step legal?" is simple enough to be *shown* rather than explained.

So statements from `set.mm` are cards in a palette; dragging one onto the bench
turns it into a block whose sockets accept only what unifies with them: a legal
step physically fits, an illegal one won't seat.
Substitution runs as a single simultaneous pass, statements render in set.mm's
own notation, and each block's silhouette is cut from its own rows, so the shape
carries the rule instead of a legend. Placing, seating, ejecting and a full
keyboard route all work; the prototype stops short of a completed proof.

## The moments that mattered

### The correction went into the harness, not the next prompt

Assignment 1 started from the template harness rather than the previous crit's:
most of that file was rules earned by a different brief, and a stale rule is one
the agent will still try to obey. What survived was a finding about the course's
own CI — `linkinator` serves `dist/` at the domain root, so a base path turns
*correct* links red — restated here alongside two more harness edits made before
any feature code: naming the one case where committing red is right, and putting
`src/` under `tsc` before the directory existed, since Vite only compiles what a
page imports.
[`16509c3...efa8ef0`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-amackay/compare/16509c3...efa8ef0)

The upstream change was to the workspace-level `CLAUDE.md` above every
deliverable repo — directions rewritten against what the agent got wrong in
earlier weeks. Those three commits are what it produced here.

### The brainstorm was committed before it was reviewed

Concept and scope were worked out in a Claude Chat session and landed as
`IDEA.md` and a first `DESIGN.md`, committed **verbatim, before review, so that
the review would be a diff**
([`ece6908`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-amackay/commit/ece6908)).
That paid immediately: the draft was written without this repo in view, so it
named a stack, a package manager and a PR workflow none of the sensors here use,
and the review replaced them with what `CLAUDE.md` says. The same pass reopened
what the draft had marked settled, each open question carrying the constraint it
had to satisfy instead of an answer
([`7784c76`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-amackay/commit/7784c76)).

### The design study arrived as a handoff, then was folded away

Visual and interaction refinement was done in Claude Design, which came back as
`HANDOFF.md` and a rewritten `DESIGN.md`
([`51c208e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-amackay/commit/51c208e)).
Once the build caught up, `IDEA.md` and `HANDOFF.md` were deleted in the same
commit that made them stale, folded into the one file that is the implementation
authority
([`03a041f`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-amackay/commit/03a041f)).

### A rule that lived in prose became a sensor

`DESIGN.md` called "the logic layer imports no DOM" non-negotiable and gave the
reason: logic bugs and pointer bugs must never be confusable. But a rule that
exists only in prose is one the next commit can break with nothing going red — so
it became a test that reads the layer's own modules and checks every import is
relative, no browser global appears, no DOM type is named. It asserts the
file list it found, so a glob matching nothing can't make the suite vacuous, and
it was confirmed to fire by adding `document.title` and watching it go red
([`3318c4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-amackay/commit/3318c4d)).
