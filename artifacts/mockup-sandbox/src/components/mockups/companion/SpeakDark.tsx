import { useEffect, useState } from "react";
import "./speak.css";

// ─── Ambient Light — Speaking (Dark) ──────────────────────────
// While speaking: slow, deep breath. Color temperature drifts
// between warmer amber and slightly cooler gold — the light
// "speaks" through warmth shifts, not waves.
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

  // Primary breath — slow, languid, 8s cycle. Like a voice exhale.
  const breath  = (Math.sin(t * 0.78) + 1) / 2;       // ~8s
  // Warmth drift — very slow temperature shift, 18s cycle
  const warmth  = (Math.sin(t * 0.35 + 0.5) + 1) / 2; // ~18s
  // Micro-shimmer — fast, tiny, 3s cycle — breath texture
  const shimmer = (Math.sin(t * 2.10 + 1.2) + 1) / 2; // ~3s

  // Hue: 26° (warm ember) ↔ 44° (cooler gold) — warmth shift while speaking
  const hue = 26 + warmth * 18;
  // Saturation pulses with breath — more saturated at peak
  const sat = 78 + breath * 14;

  // Sizes: settled, calmer than listening, but gently swelling
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
      {/* Outer atmosphere — warmth color drifts here most visibly */}
      <div className="al-blob-speak" style={{
        width: `${outerW}px`, height: `${outerH}px`,
        background: `hsl(${hue - 10}, ${sat - 16}%, 28%)`,
        opacity: 0.26 + breath * 0.10,
        filter: "blur(72px)",
      }} />

      {/* Mid bloom */}
      <div className="al-blob-speak" style={{
        width: `${midW}px`, height: `${midH}px`,
        background: `hsl(${hue - 4}, ${sat - 6}%, 50%)`,
        opacity: 0.44 + breath * 0.18,
        filter: "blur(44px)",
      }} />

      {/* Core — the warmth shift is most expressive here */}
      <div className="al-blob-speak" style={{
        width: `${coreW}px`, height: `${coreH}px`,
        background: `hsl(${hue + 2}, ${sat}%, 66%)`,
        opacity: 0.76 + breath * 0.18,
        filter: "blur(24px)",
      }} />

      {/* Inner spark — flickers with micro-shimmer */}
      <div className="al-blob-speak" style={{
        width: `${sparkW}px`, height: `${sparkH}px`,
        background: `hsl(${hue + 8}, ${sat + 4}%, 84%)`,
        opacity: 0.68 + breath * 0.24 + shimmer * 0.06,
        filter: "blur(10px)",
      }} />

      {/* Hot point */}
      <div className="al-blob-speak" style={{
        width:  `${18 + breath * 5}px`,
        height: `${16 + breath * 4}px`,
        background: "#fffdf8",
        opacity: 0.62 + breath * 0.30,
        filter: "blur(4px)",
      }} />
    </div>
  );
}

// ─── Speaking Screen — Dark ────────────────────────────────────
export function SpeakDark() {
  return (
    <div className="speak-root speak-root-dark">
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
