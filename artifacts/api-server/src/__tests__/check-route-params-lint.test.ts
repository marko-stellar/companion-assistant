/**
 * Tests for scripts/check-route-params.mjs
 *
 * Verifies that the AST-based route-param checker:
 *   - passes all safe patterns (exit 0 / empty violations)
 *   - rejects all unsafe patterns (non-empty violations)
 *
 * The checker exports `checkSourceText(src, filename)` so we can test it
 * directly without spawning a child process or touching real route files.
 */

import { describe, it, expect } from "vitest";
import { checkSourceText } from "../../scripts/check-route-params.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run the checker on a snippet; return the violation list. */
function check(src: string) {
  return checkSourceText(src, "virtual-route.ts");
}

/** Expect no violations. */
function expectSafe(src: string) {
  expect(check(src)).toHaveLength(0);
}

/** Expect at least one violation. */
function expectViolation(src: string, pattern?: RegExp) {
  const violations = check(src);
  expect(violations.length).toBeGreaterThan(0);
  if (pattern) {
    const text = violations.map((v: { text: string; note?: string }) => v.text + (v.note ?? "")).join("\n");
    expect(text).toMatch(pattern);
  }
}

// ---------------------------------------------------------------------------
// Safe patterns — must produce 0 violations
// ---------------------------------------------------------------------------

describe("check-route-params — safe patterns", () => {
  it("String(req.params.id) — dot notation, single line", () => {
    expectSafe(`
      router.get("/:id", (req, res) => {
        const id = String(req.params.id);
      });
    `);
  });

  it('String(req.params["id"]) — bracket notation wrapped', () => {
    expectSafe(`
      router.get("/:id", (req, res) => {
        const id = String(req.params["id"]);
      });
    `);
  });

  it("String(req.params.id) spanning multiple lines", () => {
    expectSafe(`
      router.get("/:id", (req, res) => {
        const id = String(
          req.params.id
        );
      });
    `);
  });

  it("multiple safe accesses in one handler", () => {
    expectSafe(`
      router.get("/:userId/:memId", (req, res) => {
        const userId = String(req.params.userId);
        const memId  = String(req.params.memId);
        res.json({ userId, memId });
      });
    `);
  });

  it("req.params reference inside a line comment is ignored", () => {
    // A string literal or comment mentioning req.params should not fire
    expectSafe(`
      // Always use String(req.params.id) in route handlers
      router.get("/", (_req, res) => { res.send("ok"); });
    `);
  });

  it("req.params reference inside a template literal string is ignored", () => {
    expectSafe(`
      const msg = \`Always call String(req.params.id)\`;
    `);
  });

  it("req.params reference inside a regular string literal is ignored", () => {
    expectSafe(`
      const doc = "use String(req.params.id) always";
    `);
  });

  it("empty file produces no violations", () => {
    expectSafe("");
  });

  it("file with no req.params at all produces no violations", () => {
    expectSafe(`
      router.get("/health", (_req, res) => { res.json({ ok: true }); });
    `);
  });
});

// ---------------------------------------------------------------------------
// Violation patterns — must produce ≥1 violation
// ---------------------------------------------------------------------------

describe("check-route-params — violation patterns", () => {
  it("bare req.params.id — dot notation without String()", () => {
    expectViolation(`
      router.get("/:id", (req, res) => {
        const id = req.params.id;
      });
    `);
  });

  it('req.params["id"] — bracket notation without String()', () => {
    expectViolation(`
      router.get("/:id", (req, res) => {
        const id = req.params["id"];
      });
    `);
  });

  it("req.params?.id — optional chain without String()", () => {
    expectViolation(`
      router.get("/:id", (req, res) => {
        const id = req.params?.id;
      });
    `);
  });

  it('req.params?.["id"] — optional-chain bracket without String()', () => {
    expectViolation(`
      router.get("/:id", (req, res) => {
        const id = req.params?.["id"];
      });
    `);
  });

  it("req.params.id as string — TypeScript cast is not runtime coercion", () => {
    expectViolation(`
      router.get("/:id", (req, res) => {
        const id = req.params.id as string;
      });
    `);
  });

  it("const { id } = req.params — destructuring bypasses String()", () => {
    expectViolation(
      `
      router.get("/:id", (req, res) => {
        const { id } = req.params;
      });
    `,
      /destructuring/,
    );
  });

  it("const { id, name } = req.params — multi-key destructuring", () => {
    expectViolation(`
      router.get("/:id/:name", (req, res) => {
        const { id, name } = req.params;
      });
    `);
  });

  it("passing req.params.id directly to a function (not String)", () => {
    expectViolation(`
      router.get("/:id", (req, res) => {
        doSomething(req.params.id);
      });
    `);
  });

  it("multiple violations in one file are all reported", () => {
    const violations = check(`
      router.get("/:a/:b", (req, res) => {
        const a = req.params.a;
        const b = req.params["b"];
      });
    `);
    expect(violations.length).toBe(2);
  });

  it("mix of safe and unsafe — only unsafe lines are reported", () => {
    const violations = check(`
      router.get("/:good/:bad", (req, res) => {
        const good = String(req.params.good);  // safe — no violation
        const bad  = req.params.bad;            // unsafe — violation
      });
    `);
    expect(violations.length).toBe(1);
    expect(violations[0].text).toMatch(/req\.params\.bad/);
  });
});
