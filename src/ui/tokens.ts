import type { Expression, Token, Typecode } from "../logic";
import { glyph } from "../notation";

/**
 * One rendered token, and where it came from.
 *
 * `from` is the *immediate* socket variable this token was substituted for, or
 * null when the token is the template's own. One level is all the render needs:
 * seated chips are collapsed one-liners, so there is no nesting depth to shade,
 * and M3's flash highlights every token a single seat produced — which is
 * exactly the spans sharing one `from`.
 */
export interface Span {
  token: Token;
  from: string | null;
}

/**
 * Substitution, keeping track of where each output token came from.
 *
 * Deliberately the same one-pass shape as the logic layer's `substitute`, and
 * `tokens.test.ts` asserts the two agree token-for-token — the annotation is a
 * rendering concern, but it must never become a second opinion about what a
 * statement says.
 */
export function spans(
  tokens: Expression,
  expand: (token: Token) => Expression | undefined,
): Span[] {
  const out: Span[] = [];
  for (const token of tokens) {
    const expansion = expand(token);
    if (expansion) {
      for (let i = 1; i < expansion.length; i++) out.push({ token: expansion[i], from: token });
    } else {
      out.push({ token, from: null });
    }
  }
  return out;
}

/**
 * The typecode cell: the coloured label at the left of a row. `|-` gets the
 * statement colour, everything else the wff colour — the distinction the visitor
 * needs is "is this a claim or a piece of syntax", not the four typecodes.
 */
export function typecodeCell(typecode: Typecode): HTMLElement {
  const cell = document.createElement("span");
  cell.className = `typecode typecode--${typecode === "|-" ? "stmt" : "wff"}`;
  cell.textContent = glyph(typecode);
  cell.dataset["token"] = typecode;
  return cell;
}

/**
 * A run of tokens, wrapping between tokens and never inside one.
 *
 * Every token is its own element with `white-space: nowrap`, so the only break
 * points flex can choose are the gaps between them: no hyphenation, no break
 * inside `->`. Variable names carry their identity colour wherever they appear;
 * anything else that arrived by substitution gets the flat provenance tint.
 */
export function tokenCell(run: Span[], variables: ReadonlySet<string>): HTMLElement {
  const cell = document.createElement("span");
  cell.className = "tokens";
  cell.append(
    ...run.map(({ token, from }) => {
      const span = document.createElement("span");
      span.className = "token";
      // The glyph is what is read; the ASCII token stays in the DOM, because it
      // is what the model, the slot paths and the flash all address things by.
      span.textContent = glyph(token);
      span.dataset["token"] = token;
      if (variables.has(token)) {
        span.classList.add("token--var");
        span.dataset["var"] = token;
      } else if (from !== null) {
        span.classList.add("token--sub");
      }
      if (from !== null) span.dataset["from"] = from;
      return span;
    }),
  );
  return cell;
}

/**
 * A whole statement as a row's worth of content: `[typecode cell][token cell]`.
 * The typecode is `tokens[0]` throughout the model, so it never appears in the
 * run — it is the cell.
 */
export function statementCells(run: Span[], variables: ReadonlySet<string>): HTMLElement[] {
  const [typecode, ...body] = run;
  return [typecodeCell(typecode.token as Typecode), tokenCell(body, variables)];
}
