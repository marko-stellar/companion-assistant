import { useEffect, useState } from "react";
import "./speak.css";

// ─── Ambient Light — Speaking (Light) ─────────────────────────
function AmbientLightSpeaking() {
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

  const breath  = (Math.sin(t * 0.78) + 1) / 2;
  const warmth  = (Math.sin(t * 0.35 + 0.5) + 1) / 2;
  const shimmer = (Math.sin(t * 2.10 + 1.2) + 1) / 2;

  const hue = 26 + warmth * 18;
  const sat = 76 + breath * 14;

  const outerW = 360 + breath * 28 + shimmer * 4;
  const outerH = 342 + breath * 24 + shimmer * 3;
  const midW   = 230 + breath * 22;
  const midH   = 218 + breath * 18;
  const coreW  = 140 + breath * 18 + shimmer * 3;
  const coreH  = 132 + breath * 14 + shimmer * 2;
  const sparkW =  58 + breath * 10;
  const sparkH =  54 + breath *  8;

  return (
    <div className="al-stage-speak">
      {/* Outer atmosphere */}
      <div className="al-blob-speak" style={{
        width: `${outerW}px`, height: `${outerH}px`,
        background: `hsl(${hue - 10}, ${sat - 14}%, 66%)`,
        opacity: 0.16 + breath * 0.08,
        filter: "blur(80px)",
      }} />

      {/* Mid bloom */}
      <div className="al-blob-speak" style={{
        width: `${midW}px`, height: `${midH}px`,
        background: `hsl(${hue - 2}, ${sat - 4}%, 58%)`,
        opacity: 0.30 + breath * 0.16,
        filter: "blur(48px)",
      }} />

      {/* Core */}
      <div className="al-blob-speak" style={{
        width: `${coreW}px`, height: `${coreH}px`,
        background: `hsl(${hue + 4}, ${sat}%, 62%)`,
        opacity: 0.54 + breath * 0.20,
        filter: "blur(26px)",
      }} />

      {/* Inner spark */}
      <div className="al-blob-speak" style={{
        width: `${sparkW}px`, height: `${sparkH}px`,
        background: `hsl(${hue + 10}, ${sat + 4}%, 80%)`,
        opacity: 0.60 + breath * 0.26 + shimmer * 0.05,
        filter: "blur(10px)",
      }} />

      {/* Hot point */}
      <div className="al-blob-speak" style={{
        width:  `${18 + breath * 5}px`,
        height: `${16 + breath * 4}px`,
        background: "#fff9f0",
        opacity: 0.65 + breath * 0.28,
        filter: "blur(4px)",
      }} />
    </div>
  );
}

// ─── Speaking Screen — Light ───────────────────────────────────
export function SpeakLight() {
  return (
    <div className="speak-root speak-root-light">
      <main className="speak-center">
        <AmbientLightSpeaking />
        <div className="speak-text-block">
          <p className="speak-line-greeting">Good morning, Marko.</p>
          <p className="speak-line-question">Did you sleep well today?</p>
        </div>
      </main>
    </div>
  );
}
