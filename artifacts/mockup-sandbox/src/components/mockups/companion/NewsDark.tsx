import { useEffect, useState } from "react";
import "./news.css";

// ─── Ambient Light — News (Dark) ──────────────────────────────
// Calm and settled — news is a quiet morning ritual.
// Slow breath, neutral warmth. Not excited, not alarming.
function AmbientLightNews() {
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

  // Slow, measured breath — like reading pace
  const breath = (Math.sin(t * 0.42) + 1) / 2;  // ~15s
  const warmth = (Math.sin(t * 0.21 + 0.5) + 1) / 2; // ~30s
  // Slightly cooler hue than other screens — information, not emotion
  const hue = 32 + warmth * 10;
  const sat = 65 + breath * 10;

  return (
    <div className="al-stage-news">
      <div className="al-blob-news" style={{
        width:  `${260 + breath * 26}px`,
        height: `${244 + breath * 22}px`,
        background: `hsl(${hue - 10}, ${sat - 22}%, 22%)`,
        opacity: 0.30 + breath * 0.12,
        filter: "blur(54px)",
      }} />
      <div className="al-blob-news" style={{
        width:  `${170 + breath * 18}px`,
        height: `${158 + breath * 14}px`,
        background: `hsl(${hue - 4}, ${sat - 12}%, 40%)`,
        opacity: 0.44 + breath * 0.16,
        filter: "blur(30px)",
      }} />
      <div className="al-blob-news" style={{
        width:  `${98 + breath * 14}px`,
        height: `${92 + breath * 10}px`,
        background: `hsl(${hue + 2}, ${sat}%, 58%)`,
        opacity: 0.72 + breath * 0.16,
        filter: "blur(15px)",
      }} />
      <div className="al-blob-news" style={{
        width:  `${38 + breath * 7}px`,
        height: `${34 + breath * 5}px`,
        background: `hsl(${hue + 8}, ${sat + 4}%, 78%)`,
        opacity: 0.66 + breath * 0.22,
        filter: "blur(6px)",
      }} />
      <div className="al-blob-news" style={{
        width:  `${12 + breath * 3}px`,
        height: `${10 + breath * 2}px`,
        background: "#fffdf8",
        opacity: 0.62 + breath * 0.28,
        filter: "blur(2px)",
      }} />
    </div>
  );
}

const HEADLINES = [
  "Daily walks shown to significantly improve memory and mood in adults over 65.",
  "Summer temperatures expected to peak across southern Europe this week.",
  "Local farmers markets extend evening hours through September.",
];

export function NewsDark() {
  return (
    <div className="news-root news-root-dark">

      {/* Light + statement */}
      <div className="news-top">
        <AmbientLightNews />
        <p className="news-statement">I've summarized today's news.</p>
      </div>

      {/* Three headlines */}
      <div className="news-headlines">
        {HEADLINES.map((text, i) => (
          <div className="news-item" key={i}>
            <span className="news-seq">0{i + 1}</span>
            <p className="news-headline">{text}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
