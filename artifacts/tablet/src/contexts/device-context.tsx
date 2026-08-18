import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import type {
  TabletContext as ApiTabletContext,
  TodayItem,
  AppointmentAlert,
} from "@workspace/api-client-react";
import {
  initDeviceAuth,
  getStoredToken,
  clearToken,
  fetchDeviceContext,
  fetchTodayItems,
  respondOccurrence,
  converse,
  synthesizeSpeech,
} from "@/lib/device-api";
import type { OccurrenceRespondRequestResponse } from "@workspace/api-client-react";
import { getStrings, getGreeting, type Strings } from "@/lib/i18n";
import { SpokenAlertController } from "@/lib/spoken-alerts";

// ── Types ──────────────────────────────────────────────────────────────────

export type AppState = "loading" | "setup" | "home";

/** Visual state of the ambient orb — drives AmbientOrb + StateLabel. */
export type CompanionState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "dnd"
  | "offline";

/** Internal voice-conversation phase — drives the real audio state machine. */
export type VoicePhase = "idle" | "recording" | "uploading" | "playing";

/** Error variants shown as senior-friendly banners below the Talk button. */
export type VoiceError =
  | "mic_denied"
  | "mic_unavailable"
  | "transcription_empty"
  | "llm_error"
  | "network_error";

interface DeviceContextValue {
  appState: AppState;
  ctx: ApiTabletContext | null;
  todayItems: TodayItem[];
  /**
   * Appointments currently inside their reminder window, including those
   * that start after the local-day boundary (e.g. a 00:15 appointment
   * checked at 23:50).  Refreshed on every /today fetch.
   */
  upcomingAlerts: AppointmentAlert[];
  /** Derived from voicePhase + DND + online state — use for Orb/label display. */
  companionState: CompanionState;
  voicePhase: VoicePhase;
  voiceError: VoiceError | null;
  clearVoiceError: () => void;
  isOnline: boolean;
  t: Strings;
  greeting: string;
  /** Called after a successful setup code entry — reloads context. */
  onSetupComplete: () => void;
  /**
   * Start a new recording turn (or stop the current one / barge into playback).
   * idle     → start recording (request mic permission)
   * recording → stop recording, upload, play reply
   * uploading → no-op (don't interrupt in-flight request)
   * playing  → stop playback, start new recording (barge-in)
   */
  activateConversation: () => Promise<void>;
  /**
   * Record a medication confirmation for a today-list item.
   * Optimistically marks the item done, then re-fetches today's items.
   */
  respondToItem: (
    occurrenceId: string,
    response: OccurrenceRespondRequestResponse,
  ) => Promise<void>;
}

const DeviceCtx = createContext<DeviceContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────────────────

/** DND check — handles overnight spans (endTime < startTime). */
function isDndActive(dnd: ApiTabletContext["dnd"] | undefined | null): boolean {
  if (!dnd || !dnd.isActive) return false;
  const now = new Date();
  const [sh, sm] = dnd.startTime.split(":").map(Number);
  const [eh, em] = dnd.endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (endMins < startMins) {
    return nowMins >= startMins || nowMins < endMins; // overnight
  }
  return nowMins >= startMins && nowMins < endMins;
}

/** Pick the best audio MIME type supported by this browser's MediaRecorder. */
function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

/** Read a Blob as a base64-encoded string (without the data-URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip "data:<mime>;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Provider ───────────────────────────────────────────────────────────────

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppState>("loading");
  const [ctx, setCtx] = useState<ApiTabletContext | null>(null);
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [upcomingAlerts, setUpcomingAlerts] = useState<AppointmentAlert[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState<VoiceError | null>(null);

  // Audio resource refs — not state, to avoid triggering re-renders
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Derive CompanionState — DND and offline take precedence over voice phase
  const companionState = useMemo((): CompanionState => {
    if (!isOnline) return "offline";
    if (isDndActive(ctx?.dnd)) return "dnd";
    switch (voicePhase) {
      case "recording": return "listening";
      case "uploading": return "thinking";
      case "playing":   return "speaking";
      default:          return "idle";
    }
  }, [voicePhase, isOnline, ctx]);

  // ── Auth init + token validation ─────────────────────────────────────────
  useEffect(() => {
    initDeviceAuth();

    const token = getStoredToken();
    if (!token) {
      setAppState("setup");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchDeviceContext();
        if (cancelled) return;
        if (!result) {
          setAppState("setup");
          return;
        }
        setCtx(result);
        setAppState("home");
        const todayData = await fetchTodayItems();
        if (!cancelled) {
          setTodayItems(todayData.items);
          setUpcomingAlerts(todayData.upcomingAlerts ?? []);
        }
      } catch {
        if (!cancelled) setAppState("setup");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Online / offline ──────────────────────────────────────────────────────
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // ── Periodic refresh + visibility + midnight rollover ─────────────────────
  // Track the local calendar date at last fetch so we can detect day rollover.
  const lastFetchDateRef = useRef<string | null>(null);

  /** Returns today's local date as "YYYY-MM-DD". */
  function localDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const refreshTodayItems = useCallback(async () => {
    try {
      const todayData = await fetchTodayItems();
      setTodayItems(todayData.items);
      setUpcomingAlerts(todayData.upcomingAlerts ?? []);
      lastFetchDateRef.current = localDateString();
    } catch {
      // Silently ignore transient errors — next poll or visibility event will retry
    }
  }, []);

  useEffect(() => {
    if (appState !== "home") return;

    // Stamp the date when we first enter home (items already loaded by auth init)
    lastFetchDateRef.current = localDateString();

    const POLL_MS = 5 * 60 * 1000; // 5 minutes

    const intervalId = setInterval(() => {
      refreshTodayItems();
    }, POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Always refresh on focus; this also covers the midnight case because
        // the API returns items for the current local day.
        refreshTodayItems();
      }
    };

    // Also handle the explicit midnight boundary: check on a 1-minute heartbeat
    // whether the local date has ticked over. If the tablet's screen stays on
    // with no visibility changes, the interval already covers it, but this
    // heartbeat guarantees a reset within 1 minute of midnight.
    const midnightCheckId = setInterval(() => {
      if (lastFetchDateRef.current && lastFetchDateRef.current !== localDateString()) {
        refreshTodayItems();
      }
    }, 60_000); // check every minute

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      clearInterval(midnightCheckId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [appState, refreshTodayItems]);

  // ── Spoken appointment reminders ──────────────────────────────────────────
  // When an appointment enters its reminder window, speak the alert once via
  // TTS. DND suppresses the spoken alert (the visual banner still shows).
  // Spoken IDs are tracked in a ref so an alert never repeats this session.
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);

  // Live mirrors of state the async alert task must re-check after awaits.
  const voicePhaseRef = useRef(voicePhase);
  voicePhaseRef.current = voicePhase;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Controller owns spoken-ID tracking, in-flight guard, and cancellation
  // (see SpokenAlertController for the retry/once-per-session guarantees).
  const spokenAlertsRef = useRef<SpokenAlertController | null>(null);
  if (!spokenAlertsRef.current) {
    spokenAlertsRef.current = new SpokenAlertController({
      canSpeakNow: () =>
        isOnlineRef.current &&
        !isDndActive(ctxRef.current?.dnd) &&
        voicePhaseRef.current === "idle",
      buildText: (alert) => {
        const strings = getStrings(ctxRef.current?.user?.language);
        return `${alert.title} ${strings.reminderSoon} ${alert.minutesUntil} ${strings.reminderMinutes}`;
      },
      synthesize: (text) => synthesizeSpeech(text),
      play: (audio, mimeType, onStarted) =>
        new Promise<void>((resolve) => {
          const player = new Audio(`data:${mimeType};base64,${audio}`);
          alertAudioRef.current = player;
          const settle = () => {
            if (alertAudioRef.current === player) alertAudioRef.current = null;
            resolve();
          };
          player.onended = settle;
          player.onerror = settle;
          // pause() (barge-in / eligibility loss / cleanup) must also settle
          // the Promise so the controller's in-flight guard is released.
          player.onpause = settle;
          player.play().then(onStarted).catch(settle); // autoplay may be blocked
        }),
    });
  }

  /** Stop any in-progress spoken alert and invalidate in-flight synthesis. */
  const stopAlertAudio = useCallback(() => {
    spokenAlertsRef.current?.cancel();
    const player = alertAudioRef.current;
    if (player) {
      alertAudioRef.current = null;
      player.pause(); // fires "pause" → settles the playback Promise
    }
  }, []);

  // Stop active alert audio the moment eligibility is lost (DND begins,
  // tablet goes offline, or a conversation starts).
  useEffect(() => {
    if (!isOnline || isDndActive(ctx?.dnd) || voicePhase !== "idle") {
      stopAlertAudio();
    }
  }, [isOnline, ctx, voicePhase, stopAlertAudio]);

  useEffect(() => {
    if (appState !== "home") return;

    const checkAndSpeak = () => {
      void spokenAlertsRef.current?.tick(upcomingAlerts, new Date());
    };

    checkAndSpeak();
    const intervalId = setInterval(checkAndSpeak, 30_000);
    return () => {
      clearInterval(intervalId);
      stopAlertAudio();
    };
  }, [appState, upcomingAlerts, stopAlertAudio]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const clearVoiceError = useCallback(() => setVoiceError(null), []);

  const onSetupComplete = useCallback(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchDeviceContext();
      if (cancelled || !result) return;
      setCtx(result);
      setAppState("home");
      const todayData = await fetchTodayItems();
      if (!cancelled) {
        setTodayItems(todayData.items);
        setUpcomingAlerts(todayData.upcomingAlerts ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const respondToItem = useCallback(
    async (
      occurrenceId: string,
      response: OccurrenceRespondRequestResponse,
    ) => {
      // Optimistic: mark the item done immediately
      setTodayItems((prev) =>
        prev.map((i) =>
          i.occurrenceId === occurrenceId ? { ...i, done: true } : i,
        ),
      );
      try {
        await respondOccurrence(occurrenceId, response);
      } catch {
        // Server refused (e.g. not yet triggered / already answered) or
        // network error — the refetch below restores the true state.
      }
      // Refresh so the list reflects the backend's done state
      const todayData = await fetchTodayItems();
      setTodayItems(todayData.items);
      setUpcomingAlerts(todayData.upcomingAlerts ?? []);
    },
    [],
  );

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const activateConversation = useCallback(async () => {
    setVoiceError(null);

    // Guard: no conversation while offline or DND
    if (!isOnline || isDndActive(ctx?.dnd)) return;

    // ── Barge-in: stop current playback (including a spoken alert) ───────
    stopAlertAudio();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
      audioPlayerRef.current = null;
    }

    clearAutoStopTimer();

    // ── Toggle off: if recording → stop and send ──────────────────────────
    if (voicePhase === "recording" && recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }

    // ── Uploading → ignore (in-flight, can't safely interrupt) ───────────
    if (voicePhase === "uploading") return;

    // ── START RECORDING ───────────────────────────────────────────────────

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
      ) {
        setVoiceError("mic_denied");
      } else {
        setVoiceError("mic_unavailable");
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    setVoicePhase("recording");

    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Release the microphone immediately
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      clearAutoStopTimer();

      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      // Too small to contain real speech — likely an accidental tap
      if (blob.size < 500) {
        setVoicePhase("idle");
        setVoiceError("transcription_empty");
        return;
      }

      setVoicePhase("uploading");

      let base64: string;
      try {
        base64 = await blobToBase64(blob);
      } catch {
        setVoicePhase("idle");
        setVoiceError("network_error");
        return;
      }

      try {
        const response = await converse({
          audio: base64,
          mimeType,
          conversationId: conversationIdRef.current ?? undefined,
        });

        conversationIdRef.current = response.conversationId;

        // TTS failed server-side — show idle (text reply was still saved to DB)
        if (!response.audio) {
          setVoicePhase("idle");
          return;
        }

        // ── PLAY REPLY ──────────────────────────────────────────────────
        setVoicePhase("playing");

        const audioUrl = `data:${response.mimeType};base64,${response.audio}`;
        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          audioPlayerRef.current = null;
          setVoicePhase("idle");
        };
        audio.onerror = () => {
          audioPlayerRef.current = null;
          setVoicePhase("idle");
        };

        await audio.play().catch(() => {
          // Browser autoplay policy blocked playback — fall back gracefully
          audioPlayerRef.current = null;
          setVoicePhase("idle");
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "transcription_empty") {
          setVoiceError("transcription_empty");
        } else if (
          msg.includes("fetch") ||
          msg.includes("network") ||
          msg.includes("NetworkError") ||
          msg.includes("Failed to fetch")
        ) {
          setVoiceError("network_error");
        } else {
          setVoiceError("llm_error");
        }
        setVoicePhase("idle");
      }
    };

    recorder.start(100); // collect chunks every 100 ms

    // Auto-stop after 30 s if the user forgets to tap again
    autoStopTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, 30_000);
  }, [voicePhase, isOnline, ctx, clearAutoStopTimer, stopAlertAudio]);

  // ── Derived display values ────────────────────────────────────────────────
  const lang = ctx?.user?.language;
  const t = getStrings(lang);
  const name =
    ctx?.user?.preferredFormOfAddress ||
    ctx?.user?.firstName ||
    ctx?.user?.displayName ||
    "";
  const greeting = ctx ? getGreeting(lang, name) : "";

  return (
    <DeviceCtx.Provider
      value={{
        appState,
        ctx,
        todayItems,
        upcomingAlerts,
        companionState,
        voicePhase,
        voiceError,
        clearVoiceError,
        isOnline,
        t,
        greeting,
        onSetupComplete,
        activateConversation,
        respondToItem,
      }}
    >
      {children}
    </DeviceCtx.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceCtx);
  if (!ctx) throw new Error("useDevice must be used inside DeviceProvider");
  return ctx;
}
