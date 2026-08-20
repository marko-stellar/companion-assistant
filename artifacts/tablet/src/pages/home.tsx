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

/** Client-side staleness threshold — mirrors the server-side guard (6 h). */
const CHECKIN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Returns true when a detectedAtUtc timestamp is too old to surface to the senior.
 * Acts as a second layer of defence after the server-side cutoff filter.
 */
function isCheckInStale(detectedAtUtc: string | null | undefined): boolean {
  if (!detectedAtUtc) return false; // no timestamp — let the server decide
  const age = Date.now() - new Date(detectedAtUtc).getTime();
  return age > CHECKIN_MAX_AGE_MS;
}

/**
 * Polls /api/tablet/pending-checkin every 60 s.
 * When a pending check-in is found it speaks the text via /api/tablet/speak,
 * then acknowledges the check-in. The banner stays visible until dismissed.
 *
 * Stale deviations (older than CHECKIN_MAX_AGE_MS) are silently skipped on
 * the client side as a second layer after the server-side cutoff filter.
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
          // Second-layer staleness guard: skip if client clock says it's too old
          if (isCheckInStale(result.detectedAtUtc)) return;
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

  return { checkIn: dismissed ? null : checkIn, dismiss: dismiss };
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
      className="flex items-start gap-3 rounded-2xl px-4 py-3"
      style={{
        background: "rgba(80,130,200,0.10)",
        border: "1px solid rgba(100,160,230,0.22)",
        backdropFilter: "blur(8px)",
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
          background: "rgba(100,160,230,0.15)",
          border: "1px solid rgba(130,180,240,0.25)",
          borderRadius: "10px",
          color: "rgba(200,225,255,0.8)",
          fontSize: "0.75rem",
          padding: "4px 12px",
          cursor: "pointer",
          fontFamily: "'Inter', sans-serif",
          whiteSpace: "nowrap",
          transition: "background 0.2s ease",
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
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: "rgba(200,155,60,0.10)",
            border: "1px solid rgba(210,170,70,0.28)",
            backdropFilter: "blur(8px)",
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

// ── Derive event status from time string and current time ───────────────────

function getEventStatus(
  timeStr: string,
  now: Date,
): "past" | "now" | "future" {
  if (!timeStr) return "future";
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h)) return "future";
  const eventMins = h * 60 + (m ?? 0);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (eventMins < nowMins - 30) return "past";
  if (eventMins <= nowMins + 15) return "now";
  return "future";
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

  return (
    <span className="flex items-center gap-2 shrink-0">
      {/* "I already took it" — primary affirm, warm amber ring */}
      <button
        onClick={() => handle("YES")}
        disabled={pending}
        className="rounded-[60px] px-4 py-2 text-sm transition-all active:scale-[0.98]"
        style={{
          background: "linear-gradient(155deg, #2a1c0e 0%, #1e1409 100%)",
          boxShadow: pending
            ? "none"
            : "0 0 0 1.5px #c89050bb, 0 0 28px 6px #c8905022, inset 0 1px 0 #ffffff0c",
          color: pending ? "rgba(180,130,70,0.4)" : "#d4a060",
          cursor: pending ? "default" : "pointer",
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          opacity: pending ? 0.5 : 1,
          border: "none",
        }}
        aria-label={t.medTaken}
      >
        ✓ {t.medTaken}
      </button>
      <button
        onClick={() => handle("UNKNOWN")}
        disabled={pending}
        className="rounded-[60px] px-4 py-2 text-sm transition-all active:scale-[0.98]"
        style={{
          background: "transparent",
          boxShadow: "0 0 0 1px #3e3022",
          color: pending ? "rgba(138,116,86,0.4)" : "#8a7456",
          cursor: pending ? "default" : "pointer",
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          opacity: pending ? 0.5 : 1,
          border: "none",
        }}
        aria-label={t.medNotSure}
      >
        ? {t.medNotSure}
      </button>
      <button
        onClick={() => handle("NO")}
        disabled={pending}
        className="rounded-[60px] px-4 py-2 text-sm transition-all active:scale-[0.98]"
        style={{
          background: "transparent",
          boxShadow: "0 0 0 1px #3e2218",
          color: pending ? "rgba(200,100,80,0.4)" : "#a06050",
          cursor: pending ? "default" : "pointer",
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          opacity: pending ? 0.5 : 1,
          border: "none",
        }}
        aria-label={t.medNotTaken}
      >
        ✗ {t.medNotTaken}
      </button>
    </span>
  );
}

// ── Portrait today list — card-style rows ──────────────────────────────────

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
        style={{
          color: "rgba(90,78,58,0.7)",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
        }}
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
          className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
            opacity: item.done ? 0.35 : 1,
            transition: "opacity 0.4s ease",
          }}
        >
          <span
            className="text-sm shrink-0"
            style={{
              color: "rgba(200,168,112,0.7)",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
              minWidth: 38,
              letterSpacing: "0.06em",
            }}
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
            className="flex-1 truncate"
            style={{
              color: "rgba(176,160,122,0.9)",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "1.1rem",
              minWidth: 80,
            }}
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

// ── Landscape schedule — elegant vertical timeline (SchedDark pattern) ──────

function ScheduleTimeline({
  items,
  t,
  now,
  onRespond,
}: {
  items: TodayItem[];
  t: Strings;
  now: Date;
  onRespond: (occurrenceId: string, response: "YES" | "UNKNOWN" | "NO") => void;
}) {
  if (!items.length) {
    return (
      <p
        className="text-base"
        style={{
          color: "rgba(90,78,58,0.6)",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
        }}
      >
        {t.noItemsToday}
      </p>
    );
  }

  return (
    <div className="relative flex flex-col" style={{ gap: 0 }}>
      {/* Vertical thread line */}
      <div
        className="absolute"
        style={{
          left: 0,
          top: 12,
          bottom: 12,
          width: 1,
          background: "linear-gradient(to bottom, transparent, #8c6c3e 12%, #8c6c3e 88%, transparent)",
        }}
      />

      {items.map((item, idx) => {
        const status = getEventStatus(item.time, now);
        return (
          <div
            key={item.id}
            className="flex flex-row items-center"
            style={{
              paddingLeft: 32,
              paddingTop: 13,
              paddingBottom: 13,
              position: "relative",
              opacity: item.done ? 0.50 : status === "past" ? 0.82 : status === "future" ? 0.95 : 1,
              transition: "opacity 0.4s ease",
              // Transform-only stagger entrance
              animation: `schedSlideIn 1.1s cubic-bezier(0.22, 1, 0.36, 1) both`,
              animationDelay: `${0.08 + idx * 0.10}s`,
            }}
          >
            {/* Thread dot */}
            <span
              style={{
                position: "absolute",
                left: status === "now" ? -5 : -4,
                top: "50%",
                transform: "translateY(-50%)",
                width: status === "now" ? 11 : 9,
                height: status === "now" ? 11 : 9,
                borderRadius: "50%",
                background: status === "now" ? "#d9a760" : "#705a38",
                border: `1px solid ${status === "now" ? "#f0c98d" : "#a18351"}`,
                boxShadow: status === "now" ? "0 0 10px 4px #c8905050" : "none",
                flexShrink: 0,
              }}
            />

            {/* Time */}
            <span
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 21,
                letterSpacing: "0.06em",
                color: "#f6e7c8",
                width: 56,
                flexShrink: 0,
                opacity: status === "now" ? 1 : 0.92,
              }}
            >
              {item.time}
            </span>

            {/* Title */}
            <span
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: status === "now" ? 400 : 300,
                fontSize: status === "now" ? 34 : status === "past" ? 28 : 31,
                letterSpacing: "0.01em",
                lineHeight: 1.1,
                color: status === "now" ? "#fff0c9" : "#f3dfbd",
                flex: 1,
              }}
            >
              {item.title}
            </span>

            {/* Unanswered medication items remain actionable even when overdue. */}
            {item.type === "medication" && !item.done && item.occurrenceId && (
              <MedicationButtons item={item} t={t} onRespond={onRespond} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── State label ─────────────────────────────────────────────────────────────

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
      className="text-base tracking-wide"
      style={{
        color: "rgba(200,225,245,0.75)",
        fontStyle: "italic",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        animation: "textFadeIn 1.2s ease forwards",
      }}
    >
      {label}
    </p>
  );
}

// ── DND overlay ──────────────────────────────────────────────────────────────

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

// ── Offline overlay ──────────────────────────────────────────────────────────

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
      className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-center text-sm"
      style={{
        background: "rgba(180,80,60,0.10)",
        border: "1px solid rgba(200,80,60,0.22)",
        color: "rgba(240,190,160,0.85)",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontStyle: "italic",
        fontSize: "1rem",
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

// ── Talk button ──────────────────────────────────────────────────────────────

/** Talk button — matches companion.css .talk-button spirit with dark ring style. */
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

  const label = isRecording
    ? t.stopListening
    : isUploading
      ? "…"
      : t.talkButton;

  // Derived box-shadow: calm dark ring style from companion.css .talk-button
  const boxShadow = isDisabled
    ? "0 0 0 1px rgba(90,78,58,0.4)"
    : isRecording
      ? "0 0 0 1.5px #cc6644bb, 0 0 48px 14px #cc664436, inset 0 1px 0 #ffffff10"
      : "0 0 0 1px #a06828, 0 0 32px 8px #a0682822, inset 0 1px 0 #ffffff08";

  const bgColor = isRecording
    ? "#1a0e08"
    : isDnd
      ? "#110e0a"
      : "#120e08";

  const textColor = isDisabled
    ? "rgba(176,122,58,0.3)"
    : isRecording
      ? "#cc8855"
      : "#b07a3a";

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="w-full transition-all active:scale-[0.98]"
      style={{
        borderRadius: 60,
        padding: "24px 0",
        background: bgColor,
        boxShadow,
        border: "none",
        cursor: isDisabled ? "not-allowed" : "pointer",
        outline: "none",
        WebkitAppearance: "none",
        appearance: "none",
        // Pulse animation while recording
        animation: isRecording ? "talkPulse 1.8s ease-in-out infinite" : "none",
      }}
      aria-label={label}
      aria-pressed={isRecording}
    >
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 400,
          fontSize: "1rem",
          letterSpacing: "0.32em",
          color: textColor,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          whiteSpace: "nowrap",
        }}
      >
        {isRecording && (
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "rgba(220,110,70,0.9)" }}
          />
        )}
        {label}
      </span>
    </button>
  );
}

// ── Photo overlay ────────────────────────────────────────────────────────────

function PhotoOverlay({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
    >
      {/* Top vignette */}
      <div
        className="absolute left-0 right-0 top-0 pointer-events-none"
        style={{
          height: 180,
          background: "linear-gradient(to bottom, rgba(14,11,8,0.55), transparent)",
          zIndex: 1,
        }}
      />
      <img
        src={url}
        alt="Photo"
        className="relative z-10"
        style={{
          maxWidth: "92vw",
          maxHeight: "78vh",
          borderRadius: 16,
          objectFit: "contain",
          // Subtle warm tone shift matching photo.css
          filter: "saturate(0.88) sepia(0.12) brightness(0.96)",
        }}
      />
      {/* Bottom gradient fade */}
      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-none"
        style={{
          height: 240,
          background: "linear-gradient(to bottom, transparent 0%, #0e0b0840 28%, #0e0b08c0 58%, #0e0b08 80%)",
          zIndex: 1,
        }}
      />
      <button
        onClick={onClose}
        className="relative z-20 mt-6 transition-all active:scale-[0.98]"
        style={{
          borderRadius: 60,
          padding: "18px 60px",
          background: "#120e08",
          boxShadow: "0 0 0 1px #a06828, 0 0 32px 8px #a0682822, inset 0 1px 0 #ffffff08",
          border: "none",
          cursor: "pointer",
          outline: "none",
        }}
        aria-label="Close photo"
      >
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 400,
            fontSize: "0.875rem",
            letterSpacing: "0.28em",
            color: "#b07a3a",
            textTransform: "uppercase",
          }}
        >
          CLOSE
        </span>
      </button>
    </div>
  );
}

// ── Companion name lockup — matches LogoDark horizontal lockup ───────────────

function CompanionNameLockup({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const ringSize = size === "sm" ? 40 : 48;
  const innerSize = size === "sm" ? 12 : 16;
  const fontSize = size === "sm" ? "1.35rem" : "1.55rem";

  return (
    <div className="flex items-center" style={{ gap: size === "sm" ? 12 : 14 }}>
      {/* The mark — outer translucent ring + inner solid circle */}
      <div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{ width: ringSize, height: ringSize }}
      >
        {/* Outer translucent ring */}
        <span
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid #4a3a22" }}
        />
        {/* Layered glow */}
        <span
          className="absolute rounded-full"
          style={{
            width: ringSize * 0.72,
            height: ringSize * 0.72,
            background: "radial-gradient(circle, hsla(34,70%,40%,0.30) 0%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            width: ringSize * 0.46,
            height: ringSize * 0.46,
            background: "radial-gradient(circle, hsla(36,85%,58%,0.65) 0%, transparent 66%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
        {/* Inner solid circle — the glow core */}
        <span
          className="relative rounded-full"
          style={{
            width: innerSize,
            height: innerSize,
            background: "radial-gradient(circle, #fffdf8 0%, hsla(40,95%,74%,0.9) 55%, transparent 75%)",
          }}
        />
      </div>
      {/* Wordmark */}
      <p
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontStyle: "italic",
          fontSize,
          letterSpacing: "0.04em",
          color: "rgba(200,155,90,0.75)",
          margin: 0,
          lineHeight: 1,
        }}
      >
        {name}
      </p>
    </div>
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
    pendingPhotoUrl,
    clearPendingPhoto,
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
      {/* Photo fullscreen overlay — shown when companion calls show_photo */}
      {pendingPhotoUrl && (
        <PhotoOverlay url={pendingPhotoUrl} onClose={clearPendingPhoto} />
      )}

      {/* Offline overlay */}
      {!isOnline && <OfflineOverlay t={t} />}

      {orientation === "portrait" ? (
        // ── Portrait layout ──────────────────────────────────────────────
        <div className="flex flex-col min-h-screen px-6 py-8 gap-6">
          {/* Header: companion lockup + greeting */}
          <header className="flex flex-col gap-2">
            <CompanionNameLockup name={companionName} size="md" />
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontSize: "1.75rem",
                fontStyle: "normal",
                letterSpacing: "0.025em",
                color: "#ede3d0",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {liveGreeting}
            </h1>
          </header>

          {/* Orb + state label */}
          <main className="flex flex-col items-center gap-4 flex-1 justify-center relative">
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
          </main>

          {/* Routine check-in banner */}
          {checkIn && (
            <CheckInBanner text={checkIn.text} onDismiss={dismissCheckIn} />
          )}

          {/* Appointment pre-alerts */}
          {appointmentAlerts.length > 0 && (
            <AppointmentAlertBanner alerts={appointmentAlerts} t={t} />
          )}

          {/* Today list */}
          <section className="flex flex-col gap-3">
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                fontSize: "0.625rem",
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: "#5a4e3a",
                margin: 0,
              }}
            >
              {t.todayLabel}
            </p>
            <TodayList items={todayItems} t={t} onRespond={handleRespond} />
          </section>

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
        // ── Landscape layout — 1194×834 reference treatment ──────────────
        // Left: greeting + today timeline | Center: orb | Right: talk button
        <div className="flex min-h-screen items-stretch">

          {/* ── Left column: name + greeting + today timeline ── */}
          <div
            className="flex flex-col justify-between py-8"
            style={{ width: "36%", paddingLeft: 68, paddingRight: 28 }}
          >
            <div className="flex flex-col gap-2">
              <CompanionNameLockup name={companionName} size="sm" />
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontWeight: 300,
                  fontSize: "2.875rem",
                  letterSpacing: "0.025em",
                  color: "#ede3d0",
                  margin: 0,
                  lineHeight: 1.15,
                }}
              >
                {liveGreeting}
              </h1>
            </div>

            {/* Banners + schedule timeline */}
            <div className="flex flex-col gap-3 flex-1 mt-5 overflow-y-auto">
              {checkIn && (
                <CheckInBanner text={checkIn.text} onDismiss={dismissCheckIn} />
              )}
              {appointmentAlerts.length > 0 && (
                <AppointmentAlertBanner alerts={appointmentAlerts} t={t} />
              )}
              {/* "Today" label */}
              <p
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontWeight: 300,
                  fontStyle: "italic",
                  fontSize: "1.5rem",
                  letterSpacing: "0.22em",
                  color: "#f6e7c8",
                  opacity: 0.95,
                  margin: "0 0 8px 0",
                  textTransform: "lowercase",
                  // Slide in from side
                  animation: "schedFadeIn 1.0s ease both",
                }}
              >
                {t.todayLabel}
              </p>
              <ScheduleTimeline
                items={todayItems}
                t={t}
                now={now}
                onRespond={handleRespond}
              />
            </div>
          </div>

          {/* ── Center column: orb ── */}
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

          {/* ── Right column: talk button + error ── */}
          <div
            className="flex flex-col items-center justify-end gap-3"
            style={{ width: "36%", paddingRight: 68, paddingBottom: 50, paddingLeft: 28 }}
          >
            {voiceError && (
              <VoiceErrorBanner
                error={voiceError}
                t={t}
                onDismiss={clearVoiceError}
              />
            )}
            <div style={{ width: "100%", maxWidth: 320 }}>
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
