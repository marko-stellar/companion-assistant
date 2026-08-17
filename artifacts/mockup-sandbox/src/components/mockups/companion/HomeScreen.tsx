import { useEffect, useState } from "react";
import "./companion.css";

// ─── Ambient Light ─────────────────────────────────────────────
// Uses filter:blur() on solid-colored divs — the only truly
// cross-browser reliable way to render a soft glowing light.
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

  // Organic breath — three non-harmonic cycles
  const A = (Math.sin(t * 0.38) + 1) / 2;        // ~16.5s
  const B = (Math.sin(t * 0.23 + 1.1) + 1) / 2;  // ~27s
  const C = (Math.sin(t * 0.59 + 2.3) + 1) / 2;  // ~10.6s
  const D = (Math.sin(t * 0.14 + 0.8) + 1) / 2;  // ~45s — slow hue drift

  // Hue: 28° gold → 44° warm amber
  const hue = 28 + D * 16;

  return (
    <div className="al-stage">
      {/* ── Outer atmosphere — largest, softest ── */}
      <div
        className="al-blob al-blob-atmosphere"
        style={{
          width:  `${340 + A * 40}px`,
          height: `${320 + B * 36}px`,
          background: `hsl(${hue - 10}, 70%, 28%)`,
          opacity: 0.28 + C * 0.12,
          filter: "blur(72px)",
          transform: `scale(${0.96 + B * 0.08})`,
        }}
      />

      {/* ── Mid bloom ── */}
      <div
        className="al-blob al-blob-mid"
        style={{
          width:  `${220 + B * 30}px`,
          height: `${210 + A * 28}px`,
          background: `hsl(${hue - 4}, 80%, 48%)`,
          opacity: 0.42 + A * 0.20,
          filter: "blur(48px)",
          transform: `scale(${0.92 + A * 0.12})`,
        }}
      />

      {/* ── Core glow — the lantern heart ── */}
      <div
        className="al-blob al-blob-core"
        style={{
          width:  `${130 + A * 24}px`,
          height: `${124 + B * 20}px`,
          background: `hsl(${hue + 2}, 88%, 68%)`,
          opacity: 0.72 + A * 0.22,
          filter: "blur(28px)",
          transform: `scale(${0.88 + A * 0.16})`,
        }}
      />

      {/* ── Bright inner spark ── */}
      <div
        className="al-blob al-blob-spark"
        style={{
          width:  `${56 + A * 12}px`,
          height: `${54 + A * 10}px`,
          background: `hsl(${hue + 6}, 95%, 88%)`,
          opacity: 0.65 + A * 0.30,
          filter: "blur(10px)",
          transform: `scale(${0.84 + A * 0.18})`,
        }}
      />

      {/* ── White hot centre point ── */}
      <div
        className="al-blob al-blob-point"
        style={{
          width:  `${18 + A * 6}px`,
          height: `${16 + A * 5}px`,
          background: "#fffdf8",
          opacity: 0.55 + A * 0.38,
          filter: "blur(4px)",
          transform: `scale(${0.80 + A * 0.22})`,
        }}
      />
    </div>
  );
}

// ─── Schedule Item ──────────────────────────────────────────────
function ScheduleItem({ time, label }: { time: string; label: string }) {
  return (
    <div className="schedule-item">
      <span className="schedule-time">{time}</span>
      <span className="schedule-label">{label}</span>
    </div>
  );
}

// ─── Home Screen ────────────────────────────────────────────────
export function HomeScreen() {
  return (
    <div className="companion-root">
      {/* ── Greeting ─────────── */}
      <header className="greeting-zone">
        <p className="greeting-text">Good Morning, Marko</p>
      </header>

      {/* ── Ambient Light ─────── */}
      <main className="light-zone">
        <AmbientLight />
        <p className="companion-question">How are you today?</p>
      </main>

      {/* ── Bottom ─────────────── */}
      <footer className="bottom-zone">
        <div className="schedule-zone">
          <p className="schedule-heading">Today</p>
          <ScheduleItem time="09:00" label="Medication" />
          <ScheduleItem time="11:30" label="Doctor" />
          <ScheduleItem time="17:00" label="Petra visiting" />
        </div>

        <button className="talk-button" aria-label="Talk to companion">
          <span className="talk-label">TALK TO ME</span>
        </button>
      </footer>
    </div>
  );
}
