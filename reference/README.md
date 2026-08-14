# Reference material

Not part of the deployed site, not read at runtime, not on the `pnpm check`
path. These exist so the palette JSON can be *checked* against its source
instead of trusted, and so nobody has to go back to the 50 MB original.

## `set.mm-propcalc.mm` — 614 KB

set.mm truncated to its first 14,541 lines: the file header, **Pre-logic**, all
of **Propositional calculus**, and **Other axiomatizations related to classical
propositional calculus**. The cut lands immediately before *Predicate calculus
with equality*, on the blank lines after a closing `$}`.

- **Upstream:** `set-2026-01-18.mm`, the 18 Jan 2026 release of
  <https://github.com/metamath/set.mm>. Extracted 14 Aug 2026 from a local copy.
- **Licence:** public domain (CC0), stated in the file's own header.
- **Byte-verbatim.** Nothing prepended, nothing rewritten, so it diffs cleanly
  against the same line range upstream. Provenance lives in this file instead.

Three reasons this range and not another:

- **It is self-contained and it verifies.** `mmverify.py` checks all 1,789
  `$a`/`$p` statements in it, standalone, in about 0.13 s.
- **It is entirely `$d`-free.** The only two `$d` tokens in the range sit inside
  the header's own explanation of the Metamath grammar; no statement in it
  carries a distinct-variable condition. That is exactly the constraint
  DESIGN.md puts on palette content, so *anything* here is fair game for a
  palette without checking first.
- **It covers more than the planned palette.** The alternative
  axiomatizations section is the obvious source for a second sandbox, and the
  early propositional theorems (`id`, `a1i`, `mp2`, `syl`, …) are worked
  examples of derivations this prototype should be able to reach by hand.

### Verifying it

```sh
python3 reference/mmverify.py reference/set.mm-propcalc.mm   # silent, exit 0
```

Silence is success. It is a real check, not a parse: changing one character of
`id`'s compressed proof (`…AECD` → `…AECC`) fails it with
`Proof stack entry […] does not match floating hypothesis (wff, ph)`.

### The palette source, verbatim

The eight statements DESIGN.md names, quoted here so hand-authoring the JSON
doesn't mean grepping 614 KB. Line numbers are into `set.mm-propcalc.mm`.

```
363  $c ( $.
364  $c ) $.
365  $c -> $.
366  $c -. $.
367  $c wff $.
369  $c |- $.
397  $v ph $.        (and ps, ch, th, ta, … following)

415  wph $f wff ph $.
417  wps $f wff ps $.
419  wch $f wff ch $.

570  wn $a wff -. ph $.
611  wi $a wff ( ph -> ps ) $.

651    min $e |- ph $.
653    maj $e |- ( ph -> ps ) $.
668    ax-mp $a |- ps $.

679  ax-1 $a |- ( ph -> ( ps -> ph ) ) $.
688  ax-2 $a |- ( ( ph -> ( ps -> ch ) ) -> ( ( ph -> ps ) -> ( ph -> ch ) ) ) $.
701  ax-3 $a |- ( ( -. ph -> -. ps ) -> ( ps -> ph ) ) $.

870  id $p |- ( ph -> ph ) $.    — M1's acceptance target, proved upstream
```

Note `ax-mp`'s shape: two `$e` essentials inside a `${ … $}` block, and the
`$f` floats it needs are inherited from the enclosing scope rather than
restated. The palette JSON flattens that scoping away — which is a
transcription decision, and one the token test below should not paper over.

## `mmverify.py` — 29 KB

The reference Metamath verifier: Raph Levien, David A. Wheeler and
contributors, MIT-licensed (SPDX header is in the file). Python 3, no
dependencies, ~700 lines.

Kept for three jobs:

1. **Proving the excerpt above is a real database**, not a lucky truncation.
2. **Settling arguments about what Metamath actually checks.** It is the
   shortest honest specification of the algorithm this prototype dramatises —
   `treat_step` and `find_vars`/`apply_subst` are the substitution-and-match
   core in about forty lines. When a design question is "but what does Metamath
   *really* do here", read it rather than reason about it.
3. **A future cross-check.** DESIGN.md keeps the logic layer free of DOM
   imports partly so an external checker can be pointed at it; this is that
   checker.

It is Python and CI is Node, so it is **not** wired into `pnpm check`. Anything
it proves has to be turned into a vitest assertion to become a standing sensor
— the palette-tokens-against-the-excerpt test in M1 is the first of those.

## Not kept

`Verify.lean` (a Lean 4 Metamath verifier, 25 KB) sat alongside `mmverify.py`
upstream. There is no Lean anywhere in this project, so it would be a file
nobody here can run — left out rather than carried for completeness.

The other 835,000 lines of set.mm: predicate calculus onward needs `$d`,
`setvar` and `class`, all of which are explicitly out of scope.
