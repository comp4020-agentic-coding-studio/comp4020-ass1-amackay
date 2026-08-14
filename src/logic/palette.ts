import type { Palette, Statement } from "./types";

const NOT_IMPLEMENTED = "M1: not implemented";

/**
 * Shape-check a parsed palette. A plain assert function rather than a schema
 * library: at this size zod would be more dependency than check.
 *
 * Malformed palettes throw loudly and name the offending path — a palette is
 * authored by hand and loaded at startup, so a quiet partial load would show up
 * much later as a block that mysteriously accepts nothing.
 */
export function assertPalette(value: unknown, source: string): asserts value is Palette {
  void value;
  void source;
  throw new Error(NOT_IMPLEMENTED);
}

export function parsePalette(json: string, source: string): Palette {
  void json;
  void source;
  throw new Error(NOT_IMPLEMENTED);
}

/** Look a statement up by label. Throws if the palette hasn't got it. */
export function statement(palette: Palette, label: string): Statement {
  void palette;
  void label;
  throw new Error(NOT_IMPLEMENTED);
}
