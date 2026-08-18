import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validate } from "../middlewares/validate";
import type { Request, Response, NextFunction } from "express";

// Minimal mocks for Express req/res/next
function makeRes() {
  let statusCode = 200;
  let body: unknown = undefined;

  const res = {
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
  } as unknown as Response & { statusCode: number; body: unknown };
  return res;
}

function makeNext() {
  return vi.fn() as unknown as NextFunction;
}

// ---------------------------------------------------------------------------
// body (default target)
// ---------------------------------------------------------------------------

describe("validate — body (default)", () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  it("calls next() and replaces req.body with parsed data when body is valid", () => {
    const req = { body: { name: "Alice", age: 30 } } as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: "Alice", age: 30 });
  });

  it("coerces data according to the schema (e.g. extra fields are stripped with .strict())", () => {
    const strictSchema = z
      .object({ name: z.string() })
      .strip(); // default — unknown keys dropped
    const req = { body: { name: "Bob", extra: "ignored" } } as Request;
    const res = makeRes();
    const next = makeNext();

    validate(strictSchema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: "Bob" }); // extra key stripped
  });

  it("returns 400 with structured errors when body is invalid", () => {
    const req = { body: { name: 123, age: "not-a-number" } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; issues: { path: string; message: string }[] };
    expect(body.error).toBe("Validation error");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 when body is missing required fields", () => {
    const req = { body: {} } as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; issues: { path: string; message: string }[] };
    expect(body.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["name", "age"]),
    );
  });

  it("reports the correct field path for nested errors", () => {
    const nestedSchema = z.object({ user: z.object({ email: z.string().email() }) });
    const req = { body: { user: { email: "not-an-email" } } } as Request;
    const res = makeRes();
    const next = makeNext();

    validate(nestedSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const body = res.body as { issues: { path: string; message: string }[] };
    expect(body.issues[0].path).toBe("user.email");
  });

  it("returns 400 when body is null / not an object", () => {
    const req = { body: null } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// query target
// ---------------------------------------------------------------------------

describe("validate — query target", () => {
  const schema = z.object({ page: z.coerce.number().int().positive() });

  it("calls next() and replaces req.query with parsed data when query is valid", () => {
    // Express query values are strings; coerce handles the conversion
    const req = { query: { page: "3" } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema, "query")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const query = req.query as unknown as { page: number };
    expect(query.page).toBe(3);
  });

  it("returns 400 when query fails validation", () => {
    const req = { query: { page: "abc" } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema, "query")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when required query param is absent", () => {
    const req = { query: {} } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema, "query")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const body = res.body as { issues: { path: string }[] };
    expect(body.issues[0].path).toBe("page");
  });
});

// ---------------------------------------------------------------------------
// params target
// ---------------------------------------------------------------------------

describe("validate — params target", () => {
  const schema = z.object({ id: z.string().uuid() });

  it("calls next() and replaces req.params when params are valid", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const req = { params: { id: uuid } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema, "params")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const params = req.params as unknown as { id: string };
    expect(params.id).toBe(uuid);
  });

  it("returns 400 when param fails validation", () => {
    const req = { params: { id: "not-a-uuid" } } as unknown as Request;
    const res = makeRes();
    const next = makeNext();

    validate(schema, "params")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string; issues: { path: string; message: string }[] };
    expect(body.error).toBe("Validation error");
    expect(body.issues[0].path).toBe("id");
  });
});
