import { useEffect, useState } from "react";
import "./listen.css";

// ─── Expanding Wave Ring ────────────────────────────────────────
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

  const eased = 1 - Math.pow(1 - progress, 2.2);
  const scale = 1 + eased * (maxScale - 1);
  const opacity = progress < 0.15
    ? (progress / 0.15) * startOpacity
    : startOpacity * Math.pow(1 - (progress - 0.15) / 0.85, 1.4);

  return (
    <div
      className="wave-ring wave-ring-light"
      style={{
        borderColor: color,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: Math.max(0, opacity),
      }}
    />
  );
}

// ─── Ambient Light — Listening (Light Theme) ────────────────────
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

  const A = (Math.sin(t * 0.52) + 1) / 2;
  const B = (Math.sin(t * 0.31 + 1.1) + 1) / 2;
  const D = (Math.sin(t * 0.14 + 0.8) + 1) / 2;

  const hue = 34 + D * 14;

  return (
    <div className="al-stage-listen">
      {/* Outer atmosphere */}
      <div className="al-blob-listen" style={{
        width:  `${400 + A * 52}px`,
        height: `${380 + B * 44}px`,
        background: `hsl(${hue - 8}, 70%, 65%)`,
        opacity: 0.20 + B * 0.10,
        filter: "blur(80px)",
        transform: `scale(${0.96 + B * 0.08})`,
      }} />

      {/* Mid bloom */}
      <div className="al-blob-listen" style={{
        width:  `${260 + B * 36}px`,
        height: `${248 + A * 30}px`,
        background: `hsl(${hue}, 82%, 58%)`,
        opacity: 0.36 + A * 0.20,
        filter: "blur(52px)",
        transform: `scale(${0.92 + A * 0.12})`,
      }} />

      {/* Core — brighter, more vivid */}
      <div className="al-blob-listen" style={{
        width:  `${156 + A * 28}px`,
        height: `${148 + B * 22}px`,
        background: `hsl(${hue + 4}, 90%, 64%)`,
        opacity: 0.62 + A * 0.20,
        filter: "blur(28px)",
        transform: `scale(${0.88 + A * 0.16})`,
      }} />

      {/* Inner spark */}
      <div className="al-blob-listen" style={{
        width:  `${68 + A * 14}px`,
        height: `${64 + A * 12}px`,
        background: `hsl(${hue + 8}, 94%, 82%)`,
        opacity: 0.65 + A * 0.28,
        filter: "blur(12px)",
        transform: `scale(${0.84 + A * 0.18})`,
      }} />

      {/* Centre point */}
      <div className="al-blob-listen" style={{
        width:  `${22 + A * 7}px`,
        height: `${20 + A * 6}px`,
        background: "#fff8f0",
        opacity: 0.72 + A * 0.24,
        filter: "blur(4px)",
        transform: `scale(${0.82 + A * 0.20})`,
      }} />

      {/* Expanding wave rings — warm amber on cream */}
      <WaveRing delay={0} duration={6} color="#c8823055" maxScale={3.8} startOpacity={0.50} />
      <WaveRing delay={2} duration={6} color="#c8823038" maxScale={3.8} startOpacity={0.38} />
      <WaveRing delay={4} duration={6} color="#c8823022" maxScale={3.8} startOpacity={0.28} />
    </div>
  );
}

// ─── Listening Screen — Light ───────────────────────────────────
export function ListenLight() {
  return (
    <div className="listen-root listen-root-light">
      <main className="listen-center">
        <AmbientLightListening />
        <p className="listening-text listening-text-light">I'm listening…</p>
      </main>
    </div>
  );
}
