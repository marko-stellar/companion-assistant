import { useEffect, useState } from "react";
import "./convo.css";

// ─── Ambient Light — Conversation (Dark) ──────────────────────
// Between speaking and listening. Engaged, warm, open.
// Slightly larger than Speaking — the exchange has momentum.
// A dual-cycle breath: long swell + a shorter flicker of attention.
function AmbientLightConvo() {
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

  // Long breath — the dialogue's pace
  const breath  = (Math.sin(t * 0.50) + 1) / 2;   // ~12.6s
  // Shorter warmth pulse — attention flickering as it listens
  const attend  = (Math.sin(t * 1.10 + 0.4) + 1) / 2; // ~5.7s
  const warmth  = (Math.sin(t * 0.22 + 1.2) + 1) / 2; // ~28.5s

  const hue = 28 + warmth * 14;   // 28–42° — warmer range than idle
  const sat = 80 + breath * 10;

  return (
    <div className="al-stage-convo">
      {/* Outer atmosphere — wide, soft */}
      <div className="al-blob-convo" style={{
        width:  `${380 + breath * 36}px`,
        height: `${360 + breath * 32}px`,
        background: `hsl(${hue - 10}, ${sat - 22}%, 22%)`,
        opacity: 0.30 + breath * 0.12,
        filter: "blur(72px)",
      }} />
      {/* Mid bloom */}
      <div className="al-blob-convo" style={{
        width:  `${248 + breath * 28}px`,
        height: `${234 + breath * 22}px`,
        background: `hsl(${hue - 4}, ${sat - 12}%, 40%)`,
        opacity: 0.44 + breath * 0.18,
        filter: "blur(44px)",
      }} />
      {/* Core — the conversation lives here */}
      <div className="al-blob-convo" style={{
        width:  `${148 + breath * 22 + attend * 6}px`,
        height: `${140 + breath * 18 + attend * 5}px`,
        background: `hsl(${hue + 2}, ${sat}%, 60%)`,
        opacity: 0.76 + breath * 0.16,
        filter: "blur(24px)",
      }} />
      {/* Inner — attentive flicker */}
      <div className="al-blob-convo" style={{
        width:  `${64 + breath * 12 + attend * 8}px`,
        height: `${60 + breath * 10 + attend * 6}px`,
        background: `hsl(${hue + 6}, ${sat + 4}%, 76%)`,
        opacity: 0.72 + breath * 0.18 + attend * 0.08,
        filter: "blur(10px)",
      }} />
      {/* Hot point */}
      <div className="al-blob-convo" style={{
        width:  `${18 + breath * 5}px`,
        height: `${16 + breath * 4}px`,
        background: "#fffdf8",
        opacity: 0.68 + breath * 0.26,
        filter: "blur(3px)",
      }} />
    </div>
  );
}

export function ConvoDark() {
  return (
    <div className="convo-root convo-root-dark">
      <AmbientLightConvo />
      <p className="convo-sentence">
        That sounds like a beautiful memory, Marko.
      </p>
      {/* Faint pulse — companion finished, Marko can speak */}
      <span className="convo-ring" />
    </div>
  );
}
