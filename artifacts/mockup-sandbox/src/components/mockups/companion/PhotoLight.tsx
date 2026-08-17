import { useEffect, useState } from "react";
import "./photo.css";

// ─── Ambient Light — Photo Conversation (Light) ───────────────
function AmbientLightPhoto() {
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

  const breath = (Math.sin(t * 0.36) + 1) / 2;
  const warmth = (Math.sin(t * 0.19 + 0.7) + 1) / 2;
  const hue = 28 + warmth * 8;
  const sat = 70 + breath * 8;

  return (
    <div className="al-stage-photo">
      {/* Outer glow */}
      <div className="al-blob-photo" style={{
        width:  `${300 + breath * 28}px`,
        height: `${280 + breath * 24}px`,
        background: `hsl(${hue - 10}, ${sat - 20}%, 58%)`,
        opacity: 0.28 + breath * 0.10,
        filter: "blur(60px)",
      }} />
      {/* Mid bloom */}
      <div className="al-blob-photo" style={{
        width:  `${168 + breath * 18}px`,
        height: `${156 + breath * 14}px`,
        background: `hsl(${hue - 2}, ${sat - 10}%, 52%)`,
        opacity: 0.38 + breath * 0.16,
        filter: "blur(32px)",
      }} />
      {/* Core */}
      <div className="al-blob-photo" style={{
        width:  `${90 + breath * 14}px`,
        height: `${84 + breath * 10}px`,
        background: `hsl(${hue + 4}, ${sat}%, 56%)`,
        opacity: 0.56 + breath * 0.18,
        filter: "blur(14px)",
      }} />
      {/* Inner spark */}
      <div className="al-blob-photo" style={{
        width:  `${34 + breath * 7}px`,
        height: `${30 + breath * 5}px`,
        background: `hsl(${hue + 10}, ${sat + 4}%, 74%)`,
        opacity: 0.62 + breath * 0.22,
        filter: "blur(6px)",
      }} />
      {/* Hot point */}
      <div className="al-blob-photo" style={{
        width:  `${10 + breath * 3}px`,
        height: `${9  + breath * 2}px`,
        background: "#fff8ee",
        opacity: 0.68 + breath * 0.24,
        filter: "blur(2px)",
      }} />
    </div>
  );
}

export function PhotoLight() {
  return (
    <div className="photo-root photo-root-light">

      {/* Full-bleed family photo */}
      <img
        className="photo-image"
        src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1400&q=85&auto=format&fit=crop"
        alt="Family gathering"
        draggable={false}
      />

      {/* Top vignette */}
      <div className="photo-vignette-top" />

      {/* Bottom gradient — photo bleeds into linen */}
      <div className="photo-gradient" />

      {/* Companion: light + question */}
      <div className="photo-companion">
        <AmbientLightPhoto />
        <p className="photo-question">Who is this with you?</p>
        <span className="photo-hint">tap to tell me</span>
      </div>

    </div>
  );
}
