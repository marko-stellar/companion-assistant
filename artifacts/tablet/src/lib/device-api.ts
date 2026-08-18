/**
 * Typed API helpers for the tablet app.
 * Uses the generated customFetch from @workspace/api-client-react,
 * configured with a Bearer token getter that reads from localStorage.
 */
import {
  setAuthTokenGetter,
  tabletSetup,
  getTabletMe,
  getTabletToday,
} from "@workspace/api-client-react";

export const TOKEN_KEY = "companion:device-token";

/** Must be called once at app startup, before any API call. */
export function initDeviceAuth(): void {
  setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Consume a one-time setup code and persist the returned device token. */
export async function setupDevice(code: string) {
  const result = await tabletSetup({ code: code.trim().toUpperCase() });
  saveToken(result.token);
  return result;
}

/** Fetch current user + companion + DND context. Returns null if token is invalid. */
export async function fetchDeviceContext() {
  try {
    return await getTabletMe();
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "response" in err &&
      (err as { response: { status: number } }).response?.status === 401
    ) {
      clearToken();
      return null;
    }
    throw err;
  }
}

/** Fetch today's schedule items. */
export async function fetchTodayItems() {
  try {
    return await getTabletToday();
  } catch {
    return { items: [] };
  }
}
