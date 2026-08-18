/**
 * Route param validation tests.
 *
 * Verifies that all admin routes with `:id` route params reject non-UUID values
 * with 400 BEFORE any database work. These tests do NOT require a real database
 * connection — the validation middleware fires first.
 *
 * Note: requireAdmin checks req.session.adminId. All requests below lack a
 * session, so a valid UUID returns 401 (auth gate) rather than hitting the DB.
 * A non-UUID must return 400 (param gate fires first).
 */

import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";

const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const BAD_IDS = [
  "not-a-uuid",
  "123",
  "00000000-0000-0000-0000-00000000000g", // invalid hex char
  "",
];

/** Routes parameterised by a :id UUID. Tuple: [method, path-with-placeholder]. */
const UUID_ROUTES: [string, string][] = [
  // conversations
  ["GET",    "/api/admin/users/:id/conversations"],
  ["GET",    "/api/admin/conversations/:id"],
  ["GET",    "/api/admin/conversations/:id/messages"],
  // memories
  ["GET",    "/api/admin/users/:id/memories"],
  ["GET",    "/api/admin/memories/:id"],
  ["PATCH",  "/api/admin/memories/:id"],
  ["POST",   "/api/admin/memories/:id/deactivate"],
  ["POST",   "/api/admin/memories/:id/reactivate"],
  // device
  ["GET",    "/api/admin/users/:id/device-status"],
  ["POST",   "/api/admin/users/:id/device-code"],
  ["DELETE", "/api/admin/users/:id/device-session"],
  // users
  ["GET",    "/api/admin/users/:id"],
  ["PATCH",  "/api/admin/users/:id"],
  ["GET",    "/api/admin/users/:id/emergency-contact"],
  ["PUT",    "/api/admin/users/:id/emergency-contact"],
  ["GET",    "/api/admin/users/:id/dnd"],
  ["PUT",    "/api/admin/users/:id/dnd"],
];

describe("Route param validation — malformed :id returns 400", () => {
  for (const [method, routeTemplate] of UUID_ROUTES) {
    for (const badId of BAD_IDS) {
      if (badId === "") continue; // empty string won't match the route pattern
      const path = routeTemplate.replace(":id", badId);

      it(`${method} ${routeTemplate} rejects id="${badId}" with 400`, async () => {
        const res = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[method.toLowerCase()](path);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty("error");
        expect(res.body.error).toMatch(/uuid/i);
      });
    }
  }
});

describe("Route param validation — valid UUID passes param gate (reaches auth check)", () => {
  for (const [method, routeTemplate] of UUID_ROUTES) {
    const path = routeTemplate.replace(":id", VALID_UUID);

    it(`${method} ${routeTemplate} with valid UUID reaches auth gate (401, not 400)`, async () => {
      const res = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[method.toLowerCase()](path);
      // Must NOT be a 400 param error — it should pass param validation and hit the auth gate
      expect(res.status).not.toBe(400);
      expect(res.status).toBe(401);
    });
  }
});
