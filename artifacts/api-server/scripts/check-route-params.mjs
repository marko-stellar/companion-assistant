#!/usr/bin/env node
/**
 * check-route-params.mjs
 *
 * AST-based linter that scans TypeScript route files and fails if any access
 * to `req.params` properties is not wrapped in `String()`.
 *
 * Safe patterns:
 *   String(req.params.id)           – dot notation, wrapped
 *   String(req.params["id"])        – bracket notation, wrapped
 *   String(                         – multiline, still wrapped
 *     req.params.id
 *   )
 *
 * Rejected patterns:
 *   req.params.id                   – bare dot access
 *   req.params["id"]                – bare bracket access
 *   req.params?.id                  – optional chain without String()
 *   req.params.id as string         – TypeScript cast (not runtime coercion)
 *   const { id } = req.params       – destructuring (bypasses String())
 *
 * The ROUTES_DIR env-var overrides the default scan directory, which lets
 * tests run the checker against synthetic fixture trees without touching the
 * real source.
 *
 * Run via:
 *   node scripts/check-route-params.mjs
 *   ROUTES_DIR=/tmp/my-fixtures node scripts/check-route-params.mjs
 */

import ts from "typescript";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Directory to scan
// ---------------------------------------------------------------------------

const DEFAULT_ROUTES_DIR = fileURLToPath(
  new URL("../src/routes", import.meta.url),
);
export const ROUTES_DIR =
  process.env.ROUTES_DIR ?? DEFAULT_ROUTES_DIR;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect .ts files under a directory. */
export function collectTs(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTs(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Returns true when `node` represents the expression `req.params`.
 * Handles both `req.params` and `req?.params` (optional chain on req).
 */
export function isReqParams(node) {
  if (!ts.isPropertyAccessExpression(node)) return false;
  const expr = node.expression;
  const name = node.name;
  return (
    ts.isIdentifier(expr) &&
    expr.text === "req" &&
    ts.isIdentifier(name) &&
    name.text === "params"
  );
}

/**
 * Returns true when `accessNode` (a req.params property or element access)
 * is the sole direct argument to a `String(...)` call.
 *
 *   String(req.params.id)       ✓
 *   String(req.params["id"])    ✓
 *   String(                     ✓ (multiline — AST parent is still the call)
 *     req.params.id
 *   )
 */
export function isInsideStringCall(accessNode, parent) {
  return (
    parent !== null &&
    ts.isCallExpression(parent) &&
    ts.isIdentifier(parent.expression) &&
    parent.expression.text === "String" &&
    parent.arguments.length === 1 &&
    parent.arguments[0] === accessNode
  );
}

// ---------------------------------------------------------------------------
// Core checker
// ---------------------------------------------------------------------------

/**
 * Check a single TypeScript source text for unsafe req.params accesses.
 *
 * @param {string} sourceText  - raw TypeScript source
 * @param {string} filename    - used only for error reporting
 * @returns {{ line: number; col: number; text: string; note?: string }[]}
 */
export function checkSourceText(sourceText, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );

  const lines = sourceText.split("\n");
  const violations = [];

  function pos(node) {
    const { line, character } =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: line + 1, col: character + 1, text: lines[line]?.trim() ?? "" };
  }

  function visit(node, parent) {
    // ── Case 1: req.params.x  /  req.params?.x ─────────────────────────────
    // PropertyAccessExpression (covers normal and optional-chain variants)
    if (
      ts.isPropertyAccessExpression(node) &&
      isReqParams(node.expression)
    ) {
      if (!isInsideStringCall(node, parent)) {
        violations.push(pos(node));
      }
    }

    // ── Case 2: req.params["x"]  /  req.params?.[x] ────────────────────────
    // ElementAccessExpression (covers normal and optional-chain variants)
    else if (
      ts.isElementAccessExpression(node) &&
      isReqParams(node.expression)
    ) {
      if (!isInsideStringCall(node, parent)) {
        violations.push(pos(node));
      }
    }

    // ── Case 3: const { x } = req.params (destructuring) ───────────────────
    // The individual bound names escape the String() coercion entirely.
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      isReqParams(node.initializer)
    ) {
      violations.push({
        ...pos(node),
        note: "destructuring from req.params bypasses String() — extract each property through String() individually",
      });
    }

    ts.forEachChild(node, (child) => visit(child, node));
  }

  visit(sourceFile, null);
  return violations;
}

/**
 * Check all .ts files under a directory tree.
 * Returns an array of { file, line, col, text, note? } objects.
 */
export function checkDirectory(dir) {
  const files = collectTs(dir);
  const all = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const v of checkSourceText(src, file)) {
      all.push({ file, ...v });
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

// Only run when invoked directly (not when imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkDirectory(ROUTES_DIR);

  if (violations.length === 0) {
    console.log(
      "✓ check-route-params: all req.params accesses are safely wrapped in String()",
    );
    process.exit(0);
  } else {
    console.error(
      `\n✗ check-route-params: found ${violations.length} unsafe req.params access(es).\n` +
        `  Wrap each access in String(), e.g.  String(req.params.id)\n`,
    );
    for (const v of violations) {
      const rel = relative(process.cwd(), v.file);
      console.error(`  ${rel}:${v.line}:${v.col}  ${v.text}`);
      if (v.note) console.error(`    ↳ ${v.note}`);
    }
    console.error("");
    process.exit(1);
  }
}
