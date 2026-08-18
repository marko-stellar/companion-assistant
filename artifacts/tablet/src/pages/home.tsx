import { useEffect, useRef, useState } from "react";
import { useDevice, type VoiceError } from "@/contexts/device-context";
import { AmbientOrb } from "@/components/ambient-orb";
import type { TodayItem } from "@workspace/api-client-react";
import type { Strings } from "@/lib/i18n";
import { getActiveAlerts, type AppointmentAlertItem } from "@/lib/alerts";
import {
  fetchPendingCheckIn,
  acknowledgeCheckIn,
  synthesizeSpeech,
} from "@/lib/device-api";

// ── Routine check-in banner ──────────────────────────────────────────────────

/**
 * Polls /api/tablet/pending-checkin every 60 s.
 * When a pending check-in is found it speaks the text via /api/tablet/speak,
 * then acknowledges the check-in. The banner stays visible until dismissed.
 */
function usePendingCheckIn() {
  const [checkIn, setCheckIn] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (cancelled) return;
      try {
        const result = await fetchPendingCheckIn();
        if (result.pending && result.id !== activeIdRef.current) {
          activeIdRef.current = result.id;
          setCheckIn({ id: result.id, text: result.text });
          setDismissed(false);
          // Speak the text proactively
          synthesizeSpeech(result.text).catch(() => {});
        }
      } catch {
        // Ignore network errors — just try again next poll
      }
    }
    void poll();
    const id = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dismiss = () => {
    if (!checkIn) return;
    setDismissed(true);
    // Fire-and-forget acknowledgement
    acknowledgeCheckIn(checkIn.id).catch(() => {});
  };

  return { checkIn: dismissed ? null : checkIn, dismiss };
}

function CheckInBanner({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{
        background: "rgba(80,130,200,0.12)",
        border: "1px solid rgba(100,160,230,0.30)",
      }}
    >
      {/* Soft blue check-in icon */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(130,180,240,0.85)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 mt-0.5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <span
        className="text-base flex-1"
        style={{
          color: "rgba(200,225,255,0.88)",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
        }}
      >
        {text}
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: "rgba(100,160,230,0.18)",
          border: "1px solid rgba(130,180,240,0.30)",
          borderRadius: "8px",
          color: "rgba(200,225,255,0.8)",
          fontSize: "0.75rem",
          padding: "4px 12px",
          cursor: "pointer",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          whiteSpace: "nowrap",
        }}
      >
        OK
      </button>
    </div>
  );
}

// ── Appointment pre-alert helpers ───────────────────────────────────────────

/** Refreshes to the current minute boundary so alert banners stay accurate. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Align to the next minute boundary, then tick every 60 s
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: ReturnType<typeof setInterval>;
    const alignTimer = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(alignTimer);
      clearInterval(intervalId);
    };
  }, []);
  return now;
}

function AppointmentAlertBanner({
  alerts,
  t,
}: {
  alerts: AppointmentAlertItem[];
  t: Strings;
}) {
  if (!alerts.length) return null;
  return (
    <div className="flex flex-col gap-2 w-full">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{
            background: "rgba(200,155,60,0.13)",
            border: "1px solid rgba(210,170,70,0.35)",
          }}
        >
          {/* Soft amber bell icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(220,180,80,0.85)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            className="text-base flex-1"
            style={{
              color: "rgba(240,215,155,0.9)",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
            }}
          >
            {alert.title} — {t.reminderSoon} {alert.minutesUntil}{" "}
            {t.reminderMinutes}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function useOrientation(): "portrait" | "landscape" {
  const [o, setO] = useState<"portrait" | "landscape">(
    window.innerWidth > window.innerHeight ? "landscape" : "portrait",
  );
  useEffect(() => {
    const update = () =>
      setO(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return o;
}

function useGreetingRefresh(greeting: string): string {
  const [cur, setCur] = useState(greeting);
  useEffect(() => {
    const id = setInterval(() => setCur(greeting), 60_000);
    return () => clearInterval(id);
  }, [greeting]);
  return cur;
}

function getVoiceErrorMessage(error: VoiceError, t: Strings): string {
  switch (error) {
    case "mic_denied":          return t.errorMicDenied;
    case "mic_unavailable":     return t.errorMicUnavailable;
    case "transcription_empty": return t.errorTranscriptionEmpty;
    case "llm_error":           return t.errorLlm;
    case "network_error":       return t.errorNetwork;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MedicationButtons({
  item,
  t,
  onRespond,
}: {
  item: TodayItem;
  t: Strings;
  onRespond: (occurrenceId: string, response: "YES" | "UNKNOWN" | "NO") => void;
}) {
  const [pending, setPending] = useState(false);
  if (!item.occurrenceId) return null;
  const occurrenceId = item.occurrenceId;

  const handle = (response: "YES" | "UNKNOWN" | "NO") => {
    if (pending) return;
    setPending(true);
    onRespond(occurrenceId, response);
  };

  const btnBase =
    "rounded-lg px-3 py-2 text-sm transition-all active:scale-95 shrink-0";

  return (
    <span className="flex items-center gap-2 shrink-0">
      <button
        onClick={() => handle("YES")}
        disabled={pending}
        className={btnBase}
        style={{
          background: "rgba(110,170,110,0.18)",
          border: "1px solid rgba(110,170,110,0.35)",
          color: "rgba(180,225,180,0.9)",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.5 : 1,
        }}
        aria-label={t.medTaken}
      >
        ✓ {t.medTaken}
      </button>
      <button
        onClick={() => handle("UNKNOWN")}
        disabled={pending}
        className={btnBase}
        style={{
          background: "rgba(200,175,110,0.14)",
          border: "1px solid rgba(200,175,110,0.3)",
          color: "rgba(230,210,160,0.85)",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.5 : 1,
        }}
        aria-label={t.medNotSure}
      >
        ? {t.medNotSure}
      </button>
      <button
        onClick={() => handle("NO")}
        disabled={pending}
        className={btnBase}
        style={{
          background: "rgba(200,90,70,0.14)",
          border: "1px solid rgba(200,90,70,0.3)",
          color: "rgba(235,175,155,0.85)",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.5 : 1,
        }}
        aria-label={t.medNotTaken}
      >
        ✗ {t.medNotTaken}
      </button>
    </span>
  );
}

function TodayList({
  items,
  t,
  onRespond,
}: {
  items: TodayItem[];
  t: Strings;
  onRespond: (occurrenceId: string, response: "YES" | "UNKNOWN" | "NO") => void;
}) {
  if (!items.length) {
    return (
      <p
        className="text-center text-base"
        style={{ color: "rgba(200,175,145,0.45)" }}
      >
        {t.noItemsToday}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 w-full">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            opacity: item.done ? 0.4 : 1,
          }}
        >
          <span
            className="text-sm font-mono shrink-0"
            style={{ color: "rgba(200,155,90,0.85)", minWidth: 40 }}
          >
            {item.time}
          </span>
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{
              background:
                item.type === "appointment"
                  ? "rgba(120,180,220,0.8)"
                  : item.type === "medication"
                    ? "rgba(150,200,140,0.8)"
                    : "rgba(180,130,90,0.8)",
            }}
          />
          <span
            className="text-base flex-1 truncate"
            style={{ color: "rgba(240,220,195,0.85)", minWidth: 80 }}
          >
            {item.title}
          </span>
          {item.type === "medication" && !item.done && item.occurrenceId && (
            <MedicationButtons item={item} t={t} onRespond={onRespond} />
          )}
        </li>
      ))}
    </ul>
  );
}

function StateLabel({
  companionState,
  t,
}: {
  companionState: string;
  t: { listening: string; thinking: string; speaking: string };
}) {
  if (!["listening", "thinking", "speaking"].includes(companionState))
    return null;
  const label =
    companionState === "listening"
      ? t.listening
      : companionState === "thinking"
        ? t.thinking
        : t.speaking;
  return (
    <p
      className="text-base tracking-wide animate-pulse"
      style={{
        color: "rgba(200,225,245,0.75)",
        fontStyle: "italic",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
      }}
    >
      {label}
    </p>
  );
}

function DndOverlay({ t }: { t: { dndTitle: string; dndSubtitle: string } }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[inherit]"
      style={{ background: "rgba(14,11,8,0.88)", zIndex: 20 }}
    >
      <svg
        width="52"
        height="52"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(160,140,200,0.75)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <p
        className="text-2xl"
        style={{
          color: "rgba(200,190,220,0.85)",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
        }}
      >
        {t.dndTitle}
      </p>
      <p className="text-sm" style={{ color: "rgba(180,165,200,0.5)" }}>
        {t.dndSubtitle}
      </p>
    </div>
  );
}

function OfflineOverlay({
  t,
}: {
  t: { offlineTitle: string; offlineSubtitle: string };
}) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background: "rgba(14,11,8,0.92)", zIndex: 50 }}
    >
      <svg
        width="52"
        height="52"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(180,130,90,0.7)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="2" y1="2" x2="22" y2="22" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M5 12.5a10 10 0 0 1 5.17-2.87" />
        <path d="M19.07 9a10 10 0 0 0-9.07-2.5" />
        <path d="M2 8.82A15 15 0 0 1 8 6" />
        <path d="M17 16.5a5 5 0 0 0-1-.5" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <p
        className="text-2xl"
        style={{
          color: "rgba(240,215,185,0.85)",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
        }}
      >
        {t.offlineTitle}
      </p>
      <p className="text-sm" style={{ color: "rgba(200,175,145,0.5)" }}>
        {t.offlineSubtitle}
      </p>
    </div>
  );
}

/** Gentle error banner displayed below the Talk button. Auto-dismisses after 5 s. */
function VoiceErrorBanner({
  error,
  t,
  onDismiss,
}: {
  error: VoiceError;
  t: Strings;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5_000);
    return () => clearTimeout(timer);
  }, [error, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm"
      style={{
        background: "rgba(180,80,60,0.12)",
        border: "1px solid rgba(200,80,60,0.25)",
        color: "rgba(240,190,160,0.85)",
      }}
    >
      {/* Gentle warning dot */}
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: "rgba(220,130,80,0.8)" }}
      />
      {getVoiceErrorMessage(error, t)}
    </div>
  );
}

/** Talk button label and styles — changes based on voice phase. */
function TalkButton({
  voicePhase,
  isDnd,
  t,
  onClick,
}: {
  voicePhase: "idle" | "recording" | "uploading" | "playing";
  isDnd: boolean;
  t: Strings;
  onClick: () => void;
}) {
  const isRecording = voicePhase === "recording";
  const isUploading = voicePhase === "uploading";
  const isDisabled = isDnd || isUploading;

  // Recording: amber-red pulse ring to signal "mic is live"
  const buttonBg = isDnd
    ? "rgba(180,130,90,0.15)"
    : isRecording
      ? "rgba(200,80,60,0.75)"
      : isUploading
        ? "rgba(180,130,90,0.3)"
        : "rgba(180,130,90,0.82)";

  const buttonColor = isDnd || isUploading
    ? "rgba(240,210,170,0.3)"
    : "rgba(255,240,215,0.95)";

  const label = isRecording
    ? t.stopListening
    : isUploading
      ? "…"
      : t.talkButton;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="w-full rounded-2xl py-7 text-2xl tracking-wide transition-all active:scale-[0.97]"
      style={{
        background: buttonBg,
        color: buttonColor,
        border: isRecording ? "2px solid rgba(220,100,70,0.5)" : "none",
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontFamily: "Inter, sans-serif",
        fontWeight: 500,
        letterSpacing: "0.04em",
        boxShadow:
          isDisabled || isUploading
            ? "none"
            : isRecording
              ? "0 4px 40px rgba(200,80,60,0.3)"
              : "0 4px 40px rgba(180,130,90,0.25)",
        // Pulse animation while recording
        animation: isRecording ? "pulse 1.5s ease-in-out infinite" : "none",
      }}
      aria-label={label}
      aria-pressed={isRecording}
    >
      {isRecording ? (
        <span className="flex items-center justify-center gap-2">
          {/* Live mic indicator */}
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: "rgba(255,100,70,0.9)" }}
          />
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

// ── Main Home Page ─────────────────────────────────────────────────────────

export function HomePage() {
  const {
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
    activateConversation,
    respondToItem,
  } = useDevice();

  const handleRespond = (
    occurrenceId: string,
    response: "YES" | "UNKNOWN" | "NO",
  ) => {
    void respondToItem(occurrenceId, response);
  };

  const orientation = useOrientation();
  const liveGreeting = useGreetingRefresh(greeting);
  const now = useMinuteClock();
  const appointmentAlerts = getActiveAlerts(upcomingAlerts, now);
  const companionName = ctx?.companion?.name ?? "Companion";
  const isDnd = companionState === "dnd";
  const orbSize = orientation === "landscape" ? 220 : 240;
  const { checkIn, dismiss: dismissCheckIn } = usePendingCheckIn();

  const handleTalkPress = () => {
    void activateConversation();
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "#0e0b08" }}
    >
      {/* Offline overlay */}
      {!isOnline && <OfflineOverlay t={t} />}

      {orientation === "portrait" ? (
        // ── Portrait layout ──────────────────────────────────────────────
        <div className="flex flex-col min-h-screen px-6 py-8 gap-6">
          {/* Header: companion name + greeting */}
          <div className="flex flex-col gap-1">
            <p
              className="text-sm tracking-[0.2em] uppercase"
              style={{ color: "rgba(200,155,90,0.55)" }}
            >
              {companionName}
            </p>
            <h1
              className="text-3xl leading-tight"
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: "italic",
                color: "rgba(255,235,200,0.88)",
              }}
            >
              {liveGreeting}
            </h1>
          </div>

          {/* Orb + state label */}
          <div className="flex flex-col items-center gap-4 flex-1 justify-center relative">
            {isDnd ? (
              <div className="relative" style={{ borderRadius: "50%" }}>
                <AmbientOrb
                  state={companionState}
                  size={orbSize}
                  companionName={companionName}
                />
                <DndOverlay t={t} />
              </div>
            ) : (
              <AmbientOrb
                state={companionState}
                size={orbSize}
                companionName={companionName}
              />
            )}
            <StateLabel companionState={companionState} t={t} />
          </div>

          {/* Routine check-in banner */}
          {checkIn && (
            <CheckInBanner text={checkIn.text} onDismiss={dismissCheckIn} />
          )}

          {/* Appointment pre-alerts */}
          {appointmentAlerts.length > 0 && (
            <AppointmentAlertBanner alerts={appointmentAlerts} t={t} />
          )}

          {/* Today list */}
          <div className="flex flex-col gap-3">
            <p
              className="text-xs tracking-[0.2em] uppercase"
              style={{ color: "rgba(200,155,90,0.5)" }}
            >
              {t.todayLabel}
            </p>
            <TodayList items={todayItems} t={t} onRespond={handleRespond} />
          </div>

          {/* Talk button + error banner */}
          <div className="flex flex-col gap-3">
            {voiceError && (
              <VoiceErrorBanner
                error={voiceError}
                t={t}
                onDismiss={clearVoiceError}
              />
            )}
            <TalkButton
              voicePhase={voicePhase}
              isDnd={isDnd}
              t={t}
              onClick={handleTalkPress}
            />
          </div>
        </div>
      ) : (
        // ── Landscape layout ─────────────────────────────────────────────
        <div className="flex min-h-screen items-stretch">
          {/* Left: greeting + today */}
          <div
            className="flex flex-col justify-between px-8 py-8 gap-4"
            style={{ width: "36%" }}
          >
            <div className="flex flex-col gap-1">
              <p
                className="text-xs tracking-[0.2em] uppercase"
                style={{ color: "rgba(200,155,90,0.55)" }}
              >
                {companionName}
              </p>
              <h1
                className="text-2xl leading-tight"
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: "italic",
                  color: "rgba(255,235,200,0.88)",
                }}
              >
                {liveGreeting}
              </h1>
            </div>
            <div className="flex flex-col gap-3 flex-1 mt-4">
              {checkIn && (
                <CheckInBanner text={checkIn.text} onDismiss={dismissCheckIn} />
              )}
              {appointmentAlerts.length > 0 && (
                <AppointmentAlertBanner alerts={appointmentAlerts} t={t} />
              )}
              <p
                className="text-xs tracking-[0.2em] uppercase"
                style={{ color: "rgba(200,155,90,0.5)" }}
              >
                {t.todayLabel}
              </p>
              <TodayList items={todayItems} t={t} onRespond={handleRespond} />
            </div>
          </div>

          {/* Center: orb */}
          <div
            className="flex flex-col items-center justify-center gap-4 relative"
            style={{ width: "28%" }}
          >
            {isDnd ? (
              <div className="relative" style={{ borderRadius: "50%" }}>
                <AmbientOrb
                  state={companionState}
                  size={orbSize}
                  companionName={companionName}
                />
                <DndOverlay t={t} />
              </div>
            ) : (
              <AmbientOrb
                state={companionState}
                size={orbSize}
                companionName={companionName}
              />
            )}
            <StateLabel companionState={companionState} t={t} />
          </div>

          {/* Right: Talk button + error */}
          <div
            className="flex flex-col items-center justify-center gap-3 px-8"
            style={{ width: "36%" }}
          >
            {voiceError && (
              <VoiceErrorBanner
                error={voiceError}
                t={t}
                onDismiss={clearVoiceError}
              />
            )}
            <div style={{ width: "100%", maxWidth: 280 }}>
              <TalkButton
                voicePhase={voicePhase}
                isDnd={isDnd}
                t={t}
                onClick={handleTalkPress}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
