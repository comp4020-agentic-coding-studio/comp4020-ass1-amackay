// @vitest-environment jsdom

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Assignment 1's published spec, turned into backpressure. The six lines are
// on the course site; each `describe` below quotes the one it answers, and the
// lines no test can hold are left as `it.todo` so they stay visible rather
// than quietly dropped.
//
// These assert CONTRACTS — what the page must do — not how it's built, so they
// survive a change of approach. The two exceptions are marked: `data-core-*`
// and the `###` moment headings are conventions this repo adopts precisely
// because the spec asks for something "plain enough to write a test for".
//
// Like the invariants, these run against the BUILT site in `dist/`, so they
// check what actually ships. `pnpm check` builds first.

const DIST = resolve("dist");
const INDEX = join(DIST, "index.html");

function builtIndex(): Document {
  expect(
    existsSync(INDEX),
    `${INDEX} not found — GitHub Pages serves dist/index.html, so without it the deployed URL is a 404. Run \`pnpm build\`.`,
  ).toBe(true);
  return new JSDOM(readFileSync(INDEX, "utf8")).window.document;
}

describe('spec: "deployed and live at its public GitHub Pages URL by the deadline"', () => {
  // The live URL can only be checked once the repo is public — that's the CI
  // deploy job and `/comp4020:preflight`. What's checkable here is the local
  // precondition: a root index.html whose references survive the move to a
  // project path.
  //
  // A test asserting <main> holds text in the BUILT page was here, and was
  // wrong for this artefact: the canvas is rendered from script, so an empty
  // <main> in the shipped HTML is what correct looks like. The claim it meant
  // to make — the page has something to show — is held below, by the test that
  // imports main.ts and requires [data-core-output] to change.
  it("references no asset by a root-absolute path", () => {
    // The site is served from …github.io/comp4020-ass1-amackay/, so a
    // root-absolute href resolves to the wrong origin path and 404s on the
    // live URL while looking perfect under `pnpm dev`. See CLAUDE.md.
    const doc = builtIndex();
    const offenders = refs(doc).filter((r) => r.startsWith("/"));
    expect(
      offenders,
      `Root-absolute references 404 on the deployed URL (served under /comp4020-ass1-amackay/). Make these relative: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it.todo(
    "the live URL actually serves — check with /comp4020:preflight once the repo is public",
  );
});

describe('spec: "static and client-side throughout"', () => {
  it("resolves every local reference to a file that shipped", () => {
    const doc = builtIndex();
    const missing = refs(doc)
      .filter((r) => !/^(https?:)?\/\//.test(r) && !r.startsWith("data:") && !r.startsWith("#"))
      .map((r) => r.split(/[?#]/)[0])
      .filter((r) => r && !existsSync(resolve(dirname(INDEX), r)));
    expect(
      missing,
      `These reference files that aren't in dist/, so they 404 for a visitor: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("ships the fonts its stylesheet asks for", () => {
    // The check above walks [src] and [href] in the markup, which is every
    // reference except the ones inside CSS — so a wrong font path would ship as
    // a silent fall back to whatever face the reader's machine has, which is
    // the exact thing shipping the font exists to prevent. Nothing looks broken;
    // it just quietly stops being the same page for everybody.
    const css = readdirSync(join(DIST, "assets"))
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFileSync(join(DIST, "assets", name), "utf8"))
      .join("\n");

    const fonts = [...css.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)].map((m) => m[1]);
    expect(fonts.length, "The built CSS references no woff2 at all.").toBe(2);

    const missing = fonts.filter((ref) => !existsSync(resolve(DIST, "assets", ref)));
    expect(missing, `Fonts the CSS asks for that aren't in dist/: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("ships no server-side artefact into dist", () => {
    // A static build has nothing to execute on a server. Anything here that
    // needs a runtime means the deployed site is not what was tested.
    const strays = ["dist/server", "dist/api", "dist/.env"].filter((p) => existsSync(resolve(p)));
    expect(strays, `Pages serves files, not processes: ${strays.join(", ")}`).toEqual([]);
  });

  // The starter invariants (spec/invariants.test.ts) carry the rest of this
  // line — language, title, viewport, one h1, nav landmark, image alt text.
});

describe('spec: "the visitor does something that changes what they see"', () => {
  // The spec asks for the core interaction to be stated "plainly enough to
  // write a test for it". This repo states it in the markup: the control the
  // visitor operates carries `data-core-interaction`, and the region that
  // changes as a result carries `data-core-output`. That convention is what
  // makes the rest of this block possible.
  it("names its core interaction in the markup", () => {
    const doc = builtIndex();
    expect(
      doc.querySelectorAll("[data-core-interaction]").length,
      "No [data-core-interaction] in the built page. Mark the control the visitor operates, so the core interaction is a thing this suite can find.",
    ).toBeGreaterThan(0);
    expect(
      doc.querySelectorAll("[data-core-output]").length,
      "No [data-core-output] in the built page. Mark the region that changes when the control is operated.",
    ).toBeGreaterThan(0);
  });

  it("gives the visitor a control the keyboard can reach", () => {
    // The marker tabs through the page, and the artefact band rewards holding
    // up "under use it wasn't designed for: the keyboard". A div with a click
    // handler passes every other test here and fails this one.
    const doc = builtIndex();
    const controls = [...doc.querySelectorAll("[data-core-interaction]")];
    const unreachable = controls.filter((el) => {
      const tabindex = el.getAttribute("tabindex");
      if (tabindex !== null) return Number(tabindex) < 0;
      return !el.matches("a[href], button, input, select, textarea, summary, [contenteditable]");
    });
    expect(
      unreachable.map((el) => el.outerHTML.slice(0, 80)),
      "These controls can't be reached by tab. Use a native interactive element, or give it tabindex=\"0\" and a role.",
    ).toEqual([]);
  });

  it("changes what the visitor sees when they operate it", async () => {
    // The behavioural half, and the one that actually answers the spec line.
    // Runs the page's own entry module against its own markup, then operates
    // the control the way a visitor would.
    const source = readFileSync(resolve("index.html"), "utf8");
    document.documentElement.innerHTML = new JSDOM(source).window.document.documentElement.innerHTML;

    const entry = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(source)?.[1];
    expect(entry, "index.html loads no module script, so nothing can change what's on screen.").toBeTruthy();
    await import(pathToFileURL(resolve(entry!)).href);
    document.dispatchEvent(new Event("DOMContentLoaded"));

    const output = document.querySelector("[data-core-output]");
    const controls = [...document.querySelectorAll("[data-core-interaction]")];
    expect(output && controls.length, "Mark the interaction first — see the test above.").toBeTruthy();

    const before = output!.innerHTML;
    for (const control of controls) {
      operate(control);
      if (output!.innerHTML !== before) break;
    }
    expect(
      output!.innerHTML,
      "Operating [data-core-interaction] left [data-core-output] byte-identical. Reading isn't interacting — the visitor has to change what they see.",
    ).not.toBe(before);
  });
});

describe('spec: "evidence of process is in the repo"', () => {
  // `pnpm check:evidence` already verifies the citations resolve, the
  // reflection is named right, and CLAUDE.md exists. These are the parts the
  // A1 brief adds on top and nothing else measures.
  it("keeps PROCESS.md to the brief's 400–600 words", () => {
    const words = countWords(readFileSync(resolve("PROCESS.md"), "utf8"));
    expect(
      words,
      `PROCESS.md is ${words} words; the brief fixes 400–600. It's a reading-guide, not an essay.`,
    ).toBeGreaterThanOrEqual(400);
    expect(words).toBeLessThanOrEqual(600);
  });

  it("carries three or four cited moments", () => {
    // Convention, so the count is checkable: each moment is its own `###`
    // heading and carries at least one commit citation.
    const src = readFileSync(resolve("PROCESS.md"), "utf8");
    const moments = src
      .split(/^###\s+/m)
      .slice(1)
      .filter((section) => /\[`[0-9a-f]{7,40}(\.{3}[0-9a-f]{7,40})?`\]\(/.test(section));
    expect(
      moments.length,
      `Found ${moments.length} cited moments (### headings carrying a commit link); the brief fixes three or four. Each needs room to say what you did instead of the obvious thing and how you knew it was right.`,
    ).toBeGreaterThanOrEqual(3);
    expect(moments.length).toBeLessThanOrEqual(4);
  });

  it("has the reflection the retro will read", () => {
    const path = resolve("reflections/assignment-1.md");
    expect(
      existsSync(path) && countWords(readFileSync(path, "utf8")) >= 150,
      "reflections/assignment-1.md is missing or too thin (150–300 words). The week-4 retro reads this file — there is nothing to write twice.",
    ).toBe(true);
  });

  it("shows a history that grew with the work", () => {
    // Proxies, not the contract itself: a marker judges whether the trail
    // grew alongside the code. These catch the failure mode the spec names —
    // one dump the night before.
    const dates = execFileSync("git", ["log", "--format=%ad", "--date=short"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(
      dates.length,
      `${dates.length} commits. Small, frequent commits are the record of how the work came together.`,
    ).toBeGreaterThanOrEqual(8);
    expect(
      new Set(dates).size,
      "Every commit lands on one day. That reads as a dump, not a process.",
    ).toBeGreaterThanOrEqual(2);
  });
});

// Lines that no test can hold. They're still marked at the retro, so they stay
// named here rather than quietly dropped.
describe("spec: judged by a person, not by this suite", () => {
  it.todo(
    '"it works at both marking viewports" — open the deployed URL at 1920x1080 and 390x844 in a real browser (agent-browser), use the interaction for a minute, and resize mid-use',
  );
  it.todo(
    '"one strong idea with a point of view, and nothing else" — scope is the judgement being marked; a second idea is the way this line is failed',
  );
});

/** Every URL the built page points at: assets, links, media. */
function refs(doc: Document): string[] {
  return [...doc.querySelectorAll("[src], [href]")]
    .map((el) => el.getAttribute("src") ?? el.getAttribute("href") ?? "")
    .filter(Boolean);
}

/** Prose words, ignoring code fences, HTML comments, and link targets. */
function countWords(markdown: string): number {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\]\([^)]*\)/g, "] ")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Operate a control the way a visitor would, whatever kind of control it is. */
function operate(control: Element): void {
  if (control instanceof HTMLInputElement && control.type === "range") {
    control.value = String(Number(control.value) + Number(control.step || 1));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = !control.checked;
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}
