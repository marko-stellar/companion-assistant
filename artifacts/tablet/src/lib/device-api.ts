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
  respondToOccurrence,
  type OccurrenceRespondRequestResponse,
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

/**
 * Record a medication confirmation (YES / NO / UNKNOWN) for an occurrence.
 * Throws on network errors or non-2xx responses.
 */
export async function respondOccurrence(
  occurrenceId: string,
  response: OccurrenceRespondRequestResponse,
): Promise<void> {
  await respondToOccurrence(occurrenceId, { response });
}

// ── Voice conversation ──────────────────────────────────────────────────────

export interface ConverseRequest {
  /** Base64-encoded audio blob (webm/ogg/mp4 depending on browser support). */
  audio: string;
  /** MIME type of the audio blob, e.g. "audio/webm;codecs=opus". */
  mimeType: string;
  /** Persist context across turns. Pass null on first turn of a new session. */
  conversationId?: string;
}

export interface ConverseResponse {
  /** What the user actually said (from STT). */
  transcript: string;
  /** The companion's text reply (from LLM). */
  reply: string;
  /** Base64-encoded audio of the reply (from TTS). Empty string if TTS failed. */
  audio: string;
  /** MIME type of the reply audio, e.g. "audio/mpeg" or "audio/wav". */
  mimeType: string;
  /** Conversation session ID — pass back on subsequent turns. */
  conversationId: string;
}

/**
 * Send recorded audio to the backend conversation route.
 * Returns the companion's audio reply plus the transcript and text.
 * Throws on network errors or non-2xx responses.
 */
export async function converse(req: ConverseRequest): Promise<ConverseResponse> {
  const token = getStoredToken();
  const res = await fetch("/api/tablet/converse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(
      typeof data.error === "string" ? data.error : "Conversation request failed",
    );
  }

  return res.json() as Promise<ConverseResponse>;
}
