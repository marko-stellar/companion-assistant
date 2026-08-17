import { useEffect, useState } from "react";
import "./remind.css";

// ─── Ambient Light — Reminder (Light) ─────────────────────────
function AmbientLightReminder() {
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

  const breath  = (Math.sin(t * 0.55) + 1) / 2;
  const warmth  = (Math.sin(t * 0.28 + 0.6) + 1) / 2;
  const micro   = (Math.sin(t * 1.80 + 0.9) + 1) / 2;

  const hue = 24 + warmth * 12;
  const sat = 80 + breath * 10;

  return (
    <div className="al-stage-remind">
      {/* Outer atmosphere */}
      <div className="al-blob-remind" style={{
        width:  `${320 + breath * 32}px`,
        height: `${304 + breath * 28}px`,
        background: `hsl(${hue - 8}, ${sat - 16}%, 64%)`,
        opacity: 0.18 + breath * 0.09,
        filter: "blur(72px)",
      }} />

      {/* Mid bloom */}
      <div className="al-blob-remind" style={{
        width:  `${210 + breath * 24}px`,
        height: `${198 + breath * 20}px`,
        background: `hsl(${hue}, ${sat - 6}%, 56%)`,
        opacity: 0.32 + breath * 0.16,
        filter: "blur(44px)",
      }} />

      {/* Core */}
      <div className="al-blob-remind" style={{
        width:  `${126 + breath * 20 + micro * 4}px`,
        height: `${118 + breath * 16 + micro * 3}px`,
        background: `hsl(${hue + 4}, ${sat}%, 60%)`,
        opacity: 0.58 + breath * 0.20,
        filter: "blur(22px)",
      }} />

      {/* Inner spark */}
      <div className="al-blob-remind" style={{
        width:  `${52 + breath * 10 + micro * 3}px`,
        height: `${48 + breath * 8  + micro * 2}px`,
        background: `hsl(${hue + 10}, ${sat + 4}%, 78%)`,
        opacity: 0.64 + breath * 0.24 + micro * 0.05,
        filter: "blur(9px)",
      }} />

      {/* Hot point */}
      <div className="al-blob-remind" style={{
        width:  `${16 + breath * 5}px`,
        height: `${14 + breath * 4}px`,
        background: "#fff8f0",
        opacity: 0.68 + breath * 0.26,
        filter: "blur(3px)",
      }} />
    </div>
  );
}

export function RemindLight() {
  return (
    <div className="remind-root remind-root-light">
      {/* Light */}
      <div className="remind-light-zone">
        <AmbientLightReminder />
      </div>

      {/* Message + Buttons */}
      <div className="remind-lower">
        <p className="remind-message">
          It's time to take your medication.
        </p>

        <div className="remind-buttons">
          <button className="remind-btn remind-btn-took" aria-label="I already took it">
            <span className="remind-btn-label">I already took it</span>
          </button>
          <button className="remind-btn remind-btn-notyet" aria-label="Not yet">
            <span className="remind-btn-label">Not yet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
