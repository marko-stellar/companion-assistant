import { useEffect, useState } from "react";
import { useDevice } from "@/contexts/device-context";
import { AmbientOrb } from "@/components/ambient-orb";
import type { TodayItem } from "@workspace/api-client-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function useOrientation(): "portrait" | "landscape" {
  const [o, setO] = useState<"portrait" | "landscape">(
    window.innerWidth > window.innerHeight ? "landscape" : "portrait"
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

// ── Sub-components ─────────────────────────────────────────────────────────

function TodayList({ items, t }: { items: TodayItem[]; t: { todayLabel: string; noItemsToday: string; reminder: string; appointment: string } }) {
  if (!items.length) {
    return (
      <p className="text-center text-base" style={{ color: "rgba(200,175,145,0.45)" }}>
        {t.noItemsToday}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 w-full">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            opacity: item.done ? 0.4 : 1,
          }}
        >
          {/* Time */}
          <span
            className="text-sm font-mono shrink-0"
            style={{ color: "rgba(200,155,90,0.85)", minWidth: 40 }}
          >
            {item.time}
          </span>
          {/* Type dot */}
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{
              background:
                item.type === "appointment"
                  ? "rgba(120,180,220,0.8)"
                  : "rgba(180,130,90,0.8)",
            }}
          />
          {/* Title */}
          <span
            className="text-base flex-1 truncate"
            style={{ color: "rgba(240,220,195,0.85)" }}
          >
            {item.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StateLabel({ companionState, t }: { companionState: string; t: { listening: string; thinking: string; speaking: string } }) {
  if (!["listening", "thinking", "speaking"].includes(companionState)) return null;
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
      {/* Moon icon */}
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
        style={{ color: "rgba(200,190,220,0.85)", fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic" }}
      >
        {t.dndTitle}
      </p>
      <p className="text-sm" style={{ color: "rgba(180,165,200,0.5)" }}>
        {t.dndSubtitle}
      </p>
    </div>
  );
}

function OfflineOverlay({ t }: { t: { offlineTitle: string; offlineSubtitle: string } }) {
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
        style={{ color: "rgba(240,215,185,0.85)", fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic" }}
      >
        {t.offlineTitle}
      </p>
      <p className="text-sm" style={{ color: "rgba(200,175,145,0.5)" }}>
        {t.offlineSubtitle}
      </p>
    </div>
  );
}

// ── Main Home Page ─────────────────────────────────────────────────────────

export function HomePage() {
  const { ctx, todayItems, companionState, isOnline, t, greeting, activateConversation } =
    useDevice();

  const orientation = useOrientation();
  const liveGreeting = useGreetingRefresh(greeting);
  const companionName = ctx?.companion?.name ?? "Companion";
  const isDnd = companionState === "dnd";
  const isActive = ["listening", "thinking", "speaking"].includes(companionState);
  const orbSize = orientation === "landscape" ? 220 : 240;

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "#0e0b08" }}
    >
      {/* Offline overlay */}
      {!isOnline && <OfflineOverlay t={t} />}

      {orientation === "portrait" ? (
        // ── Portrait layout ─────────────────────────────────
        <div className="flex flex-col min-h-screen px-6 py-8 gap-6">
          {/* Header: greeting */}
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
            {isDnd && (
              <div className="relative" style={{ borderRadius: "50%" }}>
                <AmbientOrb state={companionState} size={orbSize} companionName={companionName} />
                <DndOverlay t={t} />
              </div>
            )}
            {!isDnd && (
              <AmbientOrb state={companionState} size={orbSize} companionName={companionName} />
            )}
            <StateLabel companionState={companionState} t={t} />
          </div>

          {/* Today list */}
          <div className="flex flex-col gap-3">
            <p
              className="text-xs tracking-[0.2em] uppercase"
              style={{ color: "rgba(200,155,90,0.5)" }}
            >
              {t.todayLabel}
            </p>
            <TodayList items={todayItems} t={t} />
          </div>

          {/* TALK button */}
          <button
            onClick={activateConversation}
            disabled={isDnd || isActive}
            className="w-full rounded-2xl py-7 text-2xl tracking-wide transition-all active:scale-[0.97]"
            style={{
              background:
                isDnd || isActive
                  ? "rgba(180,130,90,0.15)"
                  : "rgba(180,130,90,0.82)",
              color:
                isDnd || isActive
                  ? "rgba(240,210,170,0.3)"
                  : "rgba(255,240,215,0.95)",
              border: "none",
              cursor: isDnd || isActive ? "not-allowed" : "pointer",
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              letterSpacing: "0.04em",
              boxShadow:
                isDnd || isActive
                  ? "none"
                  : "0 4px 40px rgba(180,130,90,0.25)",
            }}
            aria-label={t.talkButton}
          >
            {isActive ? <StateLabel companionState={companionState} t={t} /> : t.talkButton}
          </button>
        </div>
      ) : (
        // ── Landscape layout ────────────────────────────────
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
              <p
                className="text-xs tracking-[0.2em] uppercase"
                style={{ color: "rgba(200,155,90,0.5)" }}
              >
                {t.todayLabel}
              </p>
              <TodayList items={todayItems} t={t} />
            </div>
          </div>

          {/* Center: orb */}
          <div
            className="flex flex-col items-center justify-center gap-4 relative"
            style={{ width: "28%" }}
          >
            {isDnd ? (
              <div className="relative" style={{ borderRadius: "50%" }}>
                <AmbientOrb state={companionState} size={orbSize} companionName={companionName} />
                <DndOverlay t={t} />
              </div>
            ) : (
              <AmbientOrb state={companionState} size={orbSize} companionName={companionName} />
            )}
            <StateLabel companionState={companionState} t={t} />
          </div>

          {/* Right: TALK button */}
          <div
            className="flex flex-col items-center justify-center px-8"
            style={{ width: "36%" }}
          >
            <button
              onClick={activateConversation}
              disabled={isDnd || isActive}
              className="w-full rounded-2xl py-8 text-2xl tracking-wide transition-all active:scale-[0.97]"
              style={{
                background:
                  isDnd || isActive
                    ? "rgba(180,130,90,0.15)"
                    : "rgba(180,130,90,0.82)",
                color:
                  isDnd || isActive
                    ? "rgba(240,210,170,0.3)"
                    : "rgba(255,240,215,0.95)",
                border: "none",
                cursor: isDnd || isActive ? "not-allowed" : "pointer",
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                letterSpacing: "0.04em",
                maxWidth: 280,
                boxShadow:
                  isDnd || isActive
                    ? "none"
                    : "0 4px 40px rgba(180,130,90,0.25)",
              }}
              aria-label={t.talkButton}
            >
              {t.talkButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
