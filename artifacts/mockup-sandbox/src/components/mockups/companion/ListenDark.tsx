import { useEffect, useState } from "react";
import "./listen.css";

// ─── Expanding Wave Ring ────────────────────────────────────────
// Each ring has an offset phase so they stagger outward organically.
function WaveRing({ delay, duration, color, maxScale, startOpacity }:
  { delay: number; duration: number; color: string; maxScale: number; startOpacity: number }) {

  const [progress, setProgress] = useState(delay > 0 ? 1 - delay / duration : 0);

  useEffect(() => {
    let raf: number;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const elapsed = ((ts - t0) / 1000 + delay) % duration;
      setProgress(elapsed / duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [delay, duration]);

  // Ease: starts fast, decelerates gently — like a ripple
  const eased = 1 - Math.pow(1 - progress, 2.2);
  const scale = 1 + eased * (maxScale - 1);
  // Opacity: full → 0, fades in the last 60% of the journey
  const opacity = progress < 0.15
    ? (progress / 0.15) * startOpacity
    : startOpacity * Math.pow(1 - (progress - 0.15) / 0.85, 1.4);

  return (
    <div
      className="wave-ring"
      style={{
        borderColor: color,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: Math.max(0, opacity),
      }}
    />
  );
}

// ─── Ambient Light — Listening (Brighter, more expanded) ────────
function AmbientLightListening() {
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

  const A = (Math.sin(t * 0.52) + 1) / 2;  // slightly faster breath when listening
  const B = (Math.sin(t * 0.31 + 1.1) + 1) / 2;
  const D = (Math.sin(t * 0.14 + 0.8) + 1) / 2;

  const hue = 32 + D * 14;

  return (
    <div className="al-stage-listen">
      {/* Outer atmosphere — more expansive than home */}
      <div className="al-blob-listen" style={{
        width:  `${400 + A * 52}px`,
        height: `${380 + B * 44}px`,
        background: `hsl(${hue - 10}, 72%, 30%)`,
        opacity: 0.32 + B * 0.14,
        filter: "blur(80px)",
        transform: `scale(${0.96 + B * 0.08})`,
      }} />

      {/* Mid bloom — brighter than idle */}
      <div className="al-blob-listen" style={{
        width:  `${260 + B * 36}px`,
        height: `${248 + A * 30}px`,
        background: `hsl(${hue - 2}, 84%, 54%)`,
        opacity: 0.52 + A * 0.24,
        filter: "blur(52px)",
        transform: `scale(${0.92 + A * 0.12})`,
      }} />

      {/* Core — visibly brighter, more saturated */}
      <div className="al-blob-listen" style={{
        width:  `${156 + A * 28}px`,
        height: `${148 + B * 22}px`,
        background: `hsl(${hue + 4}, 92%, 70%)`,
        opacity: 0.82 + A * 0.16,
        filter: "blur(28px)",
        transform: `scale(${0.88 + A * 0.16})`,
      }} />

      {/* Inner spark */}
      <div className="al-blob-listen" style={{
        width:  `${68 + A * 14}px`,
        height: `${64 + A * 12}px`,
        background: `hsl(${hue + 8}, 96%, 88%)`,
        opacity: 0.72 + A * 0.26,
        filter: "blur(12px)",
        transform: `scale(${0.84 + A * 0.18})`,
      }} />

      {/* White-gold point */}
      <div className="al-blob-listen" style={{
        width:  `${22 + A * 7}px`,
        height: `${20 + A * 6}px`,
        background: "#fffdf8",
        opacity: 0.70 + A * 0.28,
        filter: "blur(4px)",
        transform: `scale(${0.82 + A * 0.20})`,
      }} />

      {/* ── Expanding wave rings ── */}
      {/* 3 rings staggered 2s apart on a 6s cycle */}
      <WaveRing delay={0}   duration={6} color="#c8823088" maxScale={3.8} startOpacity={0.55} />
      <WaveRing delay={2}   duration={6} color="#c8823066" maxScale={3.8} startOpacity={0.45} />
      <WaveRing delay={4}   duration={6} color="#c8823044" maxScale={3.8} startOpacity={0.35} />
    </div>
  );
}

// ─── Listening Screen — Dark ────────────────────────────────────
export function ListenDark() {
  return (
    <div className="listen-root listen-root-dark">
      <main className="listen-center">
        <AmbientLightListening />
        <p className="listening-text listening-text-dark">I'm listening…</p>
      </main>
    </div>
  );
}
