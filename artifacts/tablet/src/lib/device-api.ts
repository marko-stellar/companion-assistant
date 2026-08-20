/**
 * device-api.ts — HTTP helpers for the tablet client.
 *
 * All requests include the Bearer auth token from localStorage.
 * The tablet is served beneath /tablet/, while the shared API artifact owns
 * the global /api/ path. API calls must therefore stay root-relative.
 */

import type {
  TabletContext,
  TodayItem,
} from "@workspace/api-client-react";

export type { TabletContext, TodayItem };

// ── Local type stubs for types not yet in the generated client ────────────────
// Remove these stubs once the API client is regenerated after the relevant
// routes are added to the OpenAPI spec.

/** Appointment alert — appointment that is approaching its start time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppointmentAlert = any;

/** Response value for a medication occurrence confirmation. */
export type OccurrenceRespondRequestResponse = "YES" | "NO" | "UNKNOWN";

let authTokenGetter: (() => string | null) | null = null;

export function setAuthTokenGetter(getter: () => string | null) {
  authTokenGetter = getter;
}

function getToken(): string | null {
  return authTokenGetter ? authTokenGetter() : getStoredToken();
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  return localStorage.getItem("device_token");
}

export function clearToken(): void {
  localStorage.removeItem("device_token");
}

/**
 * No-op initialiser kept for backward compat with device-context init flow.
 * Actual auth state is checked by reading getStoredToken() directly.
 */
export function initDeviceAuth(): void {
  // Keep all authenticated API helpers connected to the persisted session.
  setAuthTokenGetter(getStoredToken);
}

/**
 * Pair this device with a senior's account via a one-time setup code.
 * On success, stores the auth token in localStorage.
 */
export async function setupDevice(setupCode: string): Promise<void> {
  const res = await fetch("/api/tablet/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: setupCode }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = (await res.json()) as { token: string };
  localStorage.setItem("device_token", data.token);
}

// ── Context / today ───────────────────────────────────────────────────────────

export async function fetchDeviceContext(): Promise<TabletContext> {
  return apiGet<TabletContext>("/api/tablet/me");
}

export async function fetchTodayItems(): Promise<{
  items: TodayItem[];
  upcomingAlerts: AppointmentAlert[];
}> {
  type Resp = { items: TodayItem[]; upcomingAlerts: AppointmentAlert[] };
  return apiGet<Resp>("/api/tablet/today");
}

export async function respondOccurrence(
  occurrenceId: string,
  response: OccurrenceRespondRequestResponse,
): Promise<void> {
  await apiPost(`/api/tablet/occurrences/${occurrenceId}/respond`, { response });
}

// ── Conversation ──────────────────────────────────────────────────────────────

export interface ConverseRequest {
  audio: string;
  mimeType: string;
  conversationId?: string;
  /** UUID of the photo currently visible on the tablet screen. */
  activePhotoId?: string;
}

export interface ConverseResponse {
  transcript: string;
  reply: string;
  audio: string;
  mimeType: string;
  conversationId: string;
  /** Signed URL when the LLM called show_photo this turn. */
  photoUrl?: string;
  /** Photo UUID corresponding to photoUrl. */
  photoId?: string;
}

export async function converse(req: ConverseRequest): Promise<ConverseResponse> {
  return apiPost<ConverseResponse>("/api/tablet/converse", req);
}

export async function synthesizeSpeech(
  text: string,
): Promise<{ audio: string; mimeType: string }> {
  return apiPost<{ audio: string; mimeType: string }>("/api/tablet/speak", { text });
}

// ── Check-in ──────────────────────────────────────────────────────────────────

export interface PendingCheckInResult {
  pending: true;
  id: string;
  text: string;
  detectedAtUtc?: string | null;
}

export type CheckInResult = PendingCheckInResult | { pending: false };

export async function fetchPendingCheckIn(): Promise<CheckInResult> {
  return apiGet<CheckInResult>("/api/tablet/pending-checkin");
}

export async function acknowledgeCheckIn(id: string): Promise<void> {
  await apiPost(`/api/tablet/pending-checkin/${id}/acknowledge`, {});
}
