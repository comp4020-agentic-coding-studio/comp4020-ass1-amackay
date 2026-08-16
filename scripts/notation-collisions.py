#!/usr/bin/env python3
# One-off: what does folding Mathematical Alphanumeric Symbols to their base
# letters cost? Counts tokens that would start rendering identically to another
# token, before and after, so the fold can be judged rather than assumed.
#   python3 scripts/notation-collisions.py src/notation/althtmldef.json

import json
import sys
import unicodedata
from collections import defaultdict

MAB = range(0x1D400, 0x1D800)


def fold(text: str) -> str:
    return "".join(
        unicodedata.normalize("NFKD", c) if ord(c) in MAB else c for c in text
    )


def collisions(table):
    seen = defaultdict(list)
    for token, rendered in table.items():
        seen[rendered].append(token)
    return {glyph: tokens for glyph, tokens in seen.items() if len(tokens) > 1}


def main() -> int:
    table = json.load(open(sys.argv[1], encoding="utf-8"))
    folded = {token: fold(rendered) for token, rendered in table.items()}

    before = collisions(table)
    after = collisions(folded)
    new = {g: t for g, t in after.items() if g not in before}

    print(f"{len(table)} tokens")
    print(f"collide already: {len(before)} glyphs")
    print(f"collide after the fold: {len(after)} glyphs")
    print(f"new collisions: {len(new)}")
    for glyph, tokens in sorted(new.items())[:25]:
        print(f"  {glyph!r}  <-  {', '.join(tokens)}")

    changed = [t for t, r in folded.items() if r != table[t]]
    print(f"\nglyphs changed by the fold: {len(changed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
