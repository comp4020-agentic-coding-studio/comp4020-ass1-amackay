#!/usr/bin/env bash
# Drives the running dev server through the ⊢ ( ph -> ph ) derivation with real
# pointer gestures — set.mm's idALT route, the one src/logic/derivation.test.ts
# walks — so M3 can be checked without doing it by hand every time.
set -euo pipefail

URL="${1:-http://localhost:5173/}"

j() { agent-browser eval "$1" 2>/dev/null | tail -1; }
xy() { tr -d '[]"' | tr ',' ' '; }

drag() { # drag x1 y1 x2 y2
  agent-browser mouse move "$1" "$2" >/dev/null 2>&1
  agent-browser mouse down left >/dev/null 2>&1
  agent-browser mouse move "$(((  $1 + $3 ) / 2))" "$(((  $2 + $4 ) / 2))" >/dev/null 2>&1
  agent-browser mouse move "$3" "$4" >/dev/null 2>&1
  agent-browser mouse up left >/dev/null 2>&1
  sleep 0.8
}

# Top-left-ish point of palette entry N (0=ph 1=ps 2=ch 3=wn 4=wi 5=ax-mp 6=ax-1 7=ax-2 8=ax-3).
palette_at() {
  j "(()=>{const r=document.querySelectorAll('[data-palette-index]')[$1].getBoundingClientRect();return JSON.stringify([Math.round(r.x+18),Math.round(r.y+9)])})()"
}

# Centre of the first empty slot on the bench, in DOM order.
slot_at() {
  j "(()=>{const s=document.querySelector('[data-bench-cards] [data-slot]');if(!s)return '[0,0]';const r=s.getBoundingClientRect();return JSON.stringify([Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)])})()"
}

# Centre of the first *legal* slot, i.e. one lit while something is carried.
legal_at() {
  j "(()=>{const s=document.querySelector('[data-bench-cards] .is-legal');if(!s)return '[0,0]';const r=s.getBoundingClientRect();return JSON.stringify([Math.round(r.x+r.width/2),Math.round(r.y+r.height/2)])})()"
}

# Grab point of the collapsed bench card whose conclusion reads exactly TEXT.
# Exact, because "wff(ph->ph)" is a substring of "wff(ph->(ph->ph))".
card_at() {
  j "(()=>{const b=[...document.querySelectorAll('[data-bench-cards] > .block')].find(e=>e.classList.contains('block--collapsed')&&e.textContent.replace(/[⌄⌃]/g,'')==='$1');if(!b)return '[0,0]';const r=b.getBoundingClientRect();return JSON.stringify([Math.round(r.x+8),Math.round(r.y+8)])})()"
}

bench() { j "(()=>JSON.stringify([...document.querySelectorAll('[data-bench-cards] > .block')].map(b=>b.textContent)))()"; }

# Drag palette entry $1 to the bench at $2,$3, then fill its sockets in order
# from the arguments that follow (each either a palette index or a bench text).
place() { read -r -a P <<< "$(palette_at "$1" | xy)"; drag "${P[0]}" "${P[1]}" "$2" "$3"; }
fill_from_palette() { read -r -a P <<< "$(palette_at "$1" | xy)"; read -r -a S <<< "$(slot_at | xy)"; drag "${P[0]}" "${P[1]}" "${S[0]}" "${S[1]}"; }
fill_from_bench() { read -r -a C <<< "$(card_at "$1" | xy)"; read -r -a S <<< "$(slot_at | xy)"; drag "${C[0]}" "${C[1]}" "${S[0]}" "${S[1]}"; }

agent-browser set viewport 1700 1000 >/dev/null 2>&1
agent-browser open "$URL" >/dev/null 2>&1
sleep 1

# Seating consumes the card, so anything used twice has to be built twice.
echo "== build B = ( ph -> ph ), for E"
place 4 1000 160
fill_from_palette 0
fill_from_palette 0
echo "   $(bench)"

echo "== build E = ( ph -> ( ph -> ph ) ), consuming B"
place 4 1000 300
fill_from_palette 0
fill_from_bench "wff(ph->ph)"
echo "   $(bench)"

echo "== build B again, for ax-mp"
place 4 1000 420
fill_from_palette 0
fill_from_palette 0
echo "   $(bench)"

echo "== derive step4 = |- ( ph -> ( ph -> ph ) )  [ax-1 with ph:=ph, ps:=ph]"
place 6 1000 540
fill_from_palette 0
fill_from_palette 0
echo "   $(bench)"

echo "== place ax-mp and fill ph:=E, ps:=B, so its locks go live"
place 5 1000 700
fill_from_bench "wff(ph->(ph->ph))"
fill_from_bench "wff(ph->ph)"
echo "   $(bench)"

echo "== seat step4 into ax-mp's first lock — the exact-match moment"
read -r -a C <<< "$(card_at "|-(ph->(ph->ph))" | xy)"
agent-browser mouse move "${C[0]}" "${C[1]}" >/dev/null 2>&1
agent-browser mouse down left >/dev/null 2>&1
agent-browser mouse move $(( C[0] + 40 )) $(( C[1] + 40 )) >/dev/null 2>&1
read -r -a S <<< "$(legal_at | xy)"
echo "   legal targets while carrying: $(j "(()=>document.querySelectorAll('.is-legal').length)()")"
agent-browser mouse move "${S[0]}" "${S[1]}" >/dev/null 2>&1
agent-browser mouse up left >/dev/null 2>&1
sleep 0.8

echo
echo "keys seated: $(j "(()=>JSON.stringify([...document.querySelectorAll('[data-seated]')].map(s=>s.dataset.seated).filter(p=>p.includes('/lock/'))))()")"
echo "bench: $(bench)"
