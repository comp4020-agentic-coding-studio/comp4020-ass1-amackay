# Reference material

Third-party Metamath files, vendored so the palette JSON can be *checked*
against its source rather than trusted. Not part of the deployed site, not read
at runtime, not on the `pnpm check` path.

## `set.mm-propcalc.mm` — 614 KB

The first 14,541 lines of **set.mm** (version 2026-01-18, CC0 public domain,
<https://github.com/metamath/set.mm>): file header, *Pre-logic*, all of
*Propositional calculus*, and *Other axiomatizations related to classical
propositional calculus*. Byte-verbatim, cut immediately before *Predicate
calculus with equality*, so it diffs cleanly against the same line range
upstream.

Why this range rather than the whole 50 MB database, or a minimal excerpt:

- **It verifies standalone.** `mmverify.py` checks all 1,789 `$a`/`$p`
  statements in ~0.13 s.
- **It is entirely `$d`-free.** The only two `$d` tokens in it sit inside the
  header's explanation of the Metamath grammar; no statement carries a
  distinct-variable condition. That is DESIGN.md's constraint on palette
  content, so anything in this range is usable without checking first.
- **It is wider than the planned palette.** Alternative axiomatizations are the
  obvious second sandbox, and the early theorems (`id`, `a1i`, `mp2`, `syl`)
  are worked examples of derivations this prototype should reach by hand.
- Predicate calculus onward needs `$d`, `setvar` and `class` — all out of
  scope, so the cut loses nothing this project can use.

### Verifying

```sh
python3 reference/mmverify.py reference/set.mm-propcalc.mm   # silent, exit 0
```

Silence is success, and it is a real check rather than a parse: changing one
character of `id`'s compressed proof (`…AECD` → `…AECC`) fails it with
`Proof stack entry […] does not match floating hypothesis (wff, ph)`.

### The palette source

The statements DESIGN.md names, with line numbers into `set.mm-propcalc.mm`, so
hand-authoring the JSON doesn't mean grepping 614 KB.

```
363  $c ( $.        365  $c -> $.       367  $c wff $.
364  $c ) $.        366  $c -. $.       369  $c |- $.
397  $v ph $.       (ps, ch, th, ta, … follow)

415  wph $f wff ph $.        417  wps $f wff ps $.        419  wch $f wff ch $.

570  wn $a wff -. ph $.
611  wi $a wff ( ph -> ps ) $.
651    min $e |- ph $.
653    maj $e |- ( ph -> ps ) $.
668    ax-mp $a |- ps $.
679  ax-1 $a |- ( ph -> ( ps -> ph ) ) $.
688  ax-2 $a |- ( ( ph -> ( ps -> ch ) ) -> ( ( ph -> ps ) -> ( ph -> ch ) ) ) $.
701  ax-3 $a |- ( ( -. ph -> -. ps ) -> ( ps -> ph ) ) $.
870  id  $p |- ( ph -> ph ) $.     — M1's acceptance target
```

Note `ax-mp`'s shape: two `$e` essentials inside a `${ … $}` block, with the
`$f` floats inherited from the enclosing scope rather than restated. The palette
JSON flattens that scoping away, which is a transcription decision the token
test should not paper over.

## `demo0.mm` — 2.3 KB, `miu.mm` — 4.6 KB

Two complete formal systems, both CC0 public domain, both verifying standalone,
both `$d`-free, both readable in one sitting. Here as *candidate palettes*: they
bear on DESIGN.md's open question about whether a stranger gets in, and that
question is still open.

**`demo0.mm`** — the introductory system from Chapter 2 of the Metamath book.
Eleven statements, and structurally a rehearsal for the planned set.mm palette:
`tze`/`tpl` build terms, `weq`/`wim` build wffs, `a1`/`a2` are axioms, `mp` is
the one rule with `$e` locks, and `th1` (`⊢ t = t`) is the reachable target. It
has three typecodes — `term`, `wff`, `|-` — where propositional calculus has
two, so slot-shape matching has more to show, and its symbols (`0 + = ->`) read
as arithmetic rather than logic.

**`miu.mm`** — Hofstadter's MIU-system from *Gödel, Escher, Bach* (pp. 33ff).
One axiom (`⊢ M I`), four rules, three constants, and a target (`⊢ M U I I U`)
that needs no logical training to want.

One implementation note MIU forces into the open early: `we $a wff $.` declares
the **empty wff**. Under the one-representation model that is `["wff"]` — an
`Expr` whose tokens are just its typecode, and whose substitution body
(`slice(1)`) is empty. Legal, meaningful, and exactly the case a renderer
assuming at least one visible token gets wrong. Worth a test whichever palette
ships.

## `mmverify.py` — 29 KB

The reference Metamath verifier (Raph Levien, David A. Wheeler and
contributors; MIT, SPDX header in the file). Python 3, no dependencies, ~700
lines. Kept for three jobs:

1. Proving the excerpts above are real databases, not lucky truncations.
2. Settling what Metamath actually checks. It is the shortest honest
   specification of the algorithm this prototype dramatises — the
   substitution-and-match core is about forty lines. When the question is "but
   what does Metamath *really* do here", read it rather than reason about it.
3. A future external cross-check against the logic layer, which DESIGN.md keeps
   free of DOM imports partly for this.

Python, while CI is Node, so it is **not** wired into `pnpm check`. Anything it
proves has to become a vitest assertion to be a standing sensor — the
palette-tokens-against-source test in M1 is the first of those.
