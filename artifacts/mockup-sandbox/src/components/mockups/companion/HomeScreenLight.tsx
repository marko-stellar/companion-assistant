import { useEffect, useState } from "react";
import "./companion-light.css";

// ─── Ambient Light (Light Theme) ───────────────────────────────
// Same layered blur approach, but the light reads against
// a warm cream background — softer, more diffuse, rose-gold toned.
function AmbientLight() {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf: number;
    let t0: number | null = null;
    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      setT((ts - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const A = (Math.sin(t * 0.38) + 1) / 2;
  const B = (Math.sin(t * 0.23 + 1.1) + 1) / 2;
  const C = (Math.sin(t * 0.59 + 2.3) + 1) / 2;
  const D = (Math.sin(t * 0.14 + 0.8) + 1) / 2;

  // Hue: warm gold-rose → amber. On light bg the hue can be richer.
  const hue = 34 + D * 14;

  return (
    <div className="al-stage-light">
      {/* Outer atmosphere — broad, very soft */}
      <div
        className="al-blob-light"
        style={{
          width:  `${360 + A * 44}px`,
          height: `${340 + B * 38}px`,
          background: `hsl(${hue - 8}, 72%, 68%)`,
          opacity: 0.18 + C * 0.10,
          filter: "blur(80px)",
          transform: `scale(${0.96 + B * 0.08})`,
        }}
      />

      {/* Mid bloom */}
      <div
        className="al-blob-light"
        style={{
          width:  `${230 + B * 28}px`,
          height: `${218 + A * 24}px`,
          background: `hsl(${hue}, 80%, 58%)`,
          opacity: 0.30 + A * 0.18,
          filter: "blur(52px)",
          transform: `scale(${0.92 + A * 0.12})`,
        }}
      />

      {/* Core glow */}
      <div
        className="al-blob-light"
        style={{
          width:  `${136 + A * 22}px`,
          height: `${128 + B * 18}px`,
          background: `hsl(${hue + 4}, 86%, 62%)`,
          opacity: 0.52 + A * 0.20,
          filter: "blur(30px)",
          transform: `scale(${0.88 + A * 0.16})`,
        }}
      />

      {/* Bright inner spark */}
      <div
        className="al-blob-light"
        style={{
          width:  `${58 + A * 10}px`,
          height: `${54 + A * 9}px`,
          background: `hsl(${hue + 8}, 90%, 82%)`,
          opacity: 0.58 + A * 0.28,
          filter: "blur(12px)",
          transform: `scale(${0.84 + A * 0.18})`,
        }}
      />

      {/* White-gold centre point */}
      <div
        className="al-blob-light"
        style={{
          width:  `${20 + A * 6}px`,
          height: `${18 + A * 5}px`,
          background: "#fff8f0",
          opacity: 0.60 + A * 0.34,
          filter: "blur(5px)",
          transform: `scale(${0.80 + A * 0.22})`,
        }}
      />
    </div>
  );
}

// ─── Schedule Item ──────────────────────────────────────────────
function ScheduleItem({ time, label }: { time: string; label: string }) {
  return (
    <div className="schedule-item-light">
      <span className="schedule-time-light">{time}</span>
      <span className="schedule-label-light">{label}</span>
    </div>
  );
}

// ─── Home Screen Light ──────────────────────────────────────────
export function HomeScreenLight() {
  return (
    <div className="companion-root-light">
      {/* Subtle warm vignette at edges */}
      <div className="bg-vignette" />

      {/* ── Greeting ─────────── */}
      <header className="greeting-zone-light">
        <p className="greeting-text-light">Good Morning, Marko</p>
      </header>

      {/* ── Ambient Light ─────── */}
      <main className="light-zone-light">
        <AmbientLight />
        <p className="companion-question-light">How are you today?</p>
      </main>

      {/* ── Bottom ─────────────── */}
      <footer className="bottom-zone-light">
        <div className="schedule-zone-light">
          <p className="schedule-heading-light">Today</p>
          <ScheduleItem time="09:00" label="Medication" />
          <ScheduleItem time="11:30" label="Doctor" />
          <ScheduleItem time="17:00" label="Petra visiting" />
        </div>

        <button className="talk-button-light" aria-label="Talk to companion">
          <span className="talk-label-light">TALK TO ME</span>
        </button>
      </footer>
    </div>
  );
}
