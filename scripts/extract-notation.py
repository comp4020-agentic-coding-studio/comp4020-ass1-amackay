#!/usr/bin/env python3
# Pulls every althtmldef out of a set.mm typesetting block into {token: glyph}.
# Run by hand:  python3 scripts/extract-notation.py <set.mm> src/notation/althtmldef.json
#
# Scanned rather than matched with a regex: values are HTML, so `&rarr;` and
# `&#8866;` put semicolons *inside* the string, and any pattern ending at the
# first `;` silently truncates exactly the entries that carry the glyphs.

import html
import json
import re
import sys

TAG = re.compile(r"<[^>]*>", re.DOTALL)
COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


def skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i].isspace():
        i += 1
    return i


def read_quoted(s: str, i: int):
    """Read the quoted string at s[i]. Metamath has no escapes inside these."""
    quote = s[i]
    end = s.index(quote, i + 1)
    return s[i + 1 : end], end + 1


def read_entry(s: str, i: int):
    """Parse `"<token>" as <fragments> ;` starting just past `althtmldef`."""
    i = skip_ws(s, i)
    if i >= len(s) or s[i] not in "\"'":
        return None
    token, i = read_quoted(s, i)

    i = skip_ws(s, i)
    if not s.startswith("as", i):
        return None
    i = skip_ws(s, i + 2)

    parts = []
    while i < len(s):
        if s[i] in "\"'":
            fragment, i = read_quoted(s, i)
            parts.append(fragment)
        elif s[i] == "+":
            i += 1
        elif s[i] == ";":
            return token, "".join(parts)
        else:
            return None
        i = skip_ws(s, i)
    return None


def glyph(raw: str) -> str:
    """Drop the HTML, decode the entities, trim.

    The trim matters: values like `" &rarr; "` carry spacing meant for inline
    HTML, and this renderer lays tokens out as flex items with their own gaps.
    """
    return html.unescape(TAG.sub("", raw)).strip()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract-notation.py <set.mm> <out.json>", file=sys.stderr)
        return 2

    source = open(sys.argv[1], encoding="utf-8").read()

    # The typesetting block only. Also strips /* ... */ so commented-out
    # definitions — set.mm keeps several as history — cannot win.
    block = COMMENT.sub(" ", source[source.index("$( $t") :])

    table = {}
    for match in re.finditer(r"\balthtmldef\b", block):
        entry = read_entry(block, match.end())
        if entry is None:
            print(f"skipped an entry at offset {match.start()}", file=sys.stderr)
            continue
        token, raw = entry
        rendered = glyph(raw)
        if rendered:
            table[token] = rendered

    with open(sys.argv[2], "w", encoding="utf-8") as out:
        json.dump(dict(sorted(table.items())), out, ensure_ascii=False, indent=0)
        out.write("\n")

    print(f"{len(table)} mappings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
