/** Violation reported by the route-param checker. */
export interface ParamViolation {
  line: number;
  col: number;
  text: string;
  /** Present for destructuring violations to give a more actionable message. */
  note?: string;
}

/** Violation with file path, returned from checkDirectory. */
export interface FileParamViolation extends ParamViolation {
  file: string;
}

/**
 * Check a single TypeScript source text for unsafe req.params accesses.
 *
 * @param sourceText - raw TypeScript source code
 * @param filename   - used only in error messages / position info
 * @returns array of violations; empty array means the source is clean
 */
export function checkSourceText(
  sourceText: string,
  filename: string,
): ParamViolation[];

/**
 * Recursively scan all .ts files under `dir` and return every violation found.
 */
export function checkDirectory(dir: string): FileParamViolation[];

/** Recursively collect absolute paths to all .ts files under `dir`. */
export function collectTs(dir: string): string[];

/** True when `node` represents the expression `req.params`. */
export function isReqParams(node: import("typescript").Node): boolean;

/**
 * True when `accessNode` is the sole direct argument of a `String(...)` call.
 */
export function isInsideStringCall(
  accessNode: import("typescript").Node,
  parent: import("typescript").Node | null,
): boolean;

/** The routes directory the CLI script will scan (overridable via ROUTES_DIR env var). */
export const ROUTES_DIR: string;
