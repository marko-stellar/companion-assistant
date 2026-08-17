import { useEffect, useState } from "react";
import "./photo.css";

// ─── Ambient Light — Photo Conversation (Dark) ────────────────
// Small, settled at the bottom — the companion looking up at
// a cherished memory. Warm, patient, curious. Barely moves.
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

  // Very slow breath — almost still, like held attention
  const breath = (Math.sin(t * 0.36) + 1) / 2;   // ~17s
  const warmth = (Math.sin(t * 0.19 + 0.7) + 1) / 2; // ~33s
  const hue = 28 + warmth * 8;
  const sat = 72 + breath * 8;

  return (
    <div className="al-stage-photo">
      {/* Outer glow — softly illuminates the bottom of the photo */}
      <div className="al-blob-photo" style={{
        width:  `${300 + breath * 28}px`,
        height: `${280 + breath * 24}px`,
        background: `hsl(${hue - 10}, ${sat - 22}%, 20%)`,
        opacity: 0.55 + breath * 0.16,
        filter: "blur(56px)",
      }} />
      {/* Mid bloom */}
      <div className="al-blob-photo" style={{
        width:  `${168 + breath * 18}px`,
        height: `${156 + breath * 14}px`,
        background: `hsl(${hue - 4}, ${sat - 12}%, 38%)`,
        opacity: 0.50 + breath * 0.18,
        filter: "blur(30px)",
      }} />
      {/* Core */}
      <div className="al-blob-photo" style={{
        width:  `${90 + breath * 14}px`,
        height: `${84 + breath * 10}px`,
        background: `hsl(${hue + 2}, ${sat}%, 58%)`,
        opacity: 0.72 + breath * 0.16,
        filter: "blur(14px)",
      }} />
      {/* Inner spark */}
      <div className="al-blob-photo" style={{
        width:  `${34 + breath * 7}px`,
        height: `${30 + breath * 5}px`,
        background: `hsl(${hue + 8}, ${sat + 4}%, 78%)`,
        opacity: 0.68 + breath * 0.22,
        filter: "blur(6px)",
      }} />
      {/* Hot point */}
      <div className="al-blob-photo" style={{
        width:  `${10 + breath * 3}px`,
        height: `${9  + breath * 2}px`,
        background: "#fffcf5",
        opacity: 0.65 + breath * 0.28,
        filter: "blur(2px)",
      }} />
    </div>
  );
}

export function PhotoDark() {
  return (
    <div className="photo-root photo-root-dark">
      {/* Full-bleed family photo */}
      <img
        className="photo-image"
        src="https://images.unsplash.com/photo-1609220136736-443140cffec6?w=1400&q=85&auto=format&fit=crop"
        alt="Family gathering"
        draggable={false}
      />
      {/* Top vignette — anchors photo in dark world */}
      <div className="photo-vignette-top" />
      {/* Bottom gradient — photo bleeds into companion's space */}
      <div className="photo-gradient" />
      {/* Companion: light + question */}
      <div className="photo-companion">
        <AmbientLightPhoto />
        <p className="photo-question">Who is this with the kids?</p>
        <span className="photo-hint">tap to tell me</span>
      </div>
    </div>
  );
}
