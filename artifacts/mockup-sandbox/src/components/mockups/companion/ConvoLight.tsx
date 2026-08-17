import { useEffect, useState } from "react";
import "./convo.css";

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

  const breath  = (Math.sin(t * 0.50) + 1) / 2;
  const attend  = (Math.sin(t * 1.10 + 0.4) + 1) / 2;
  const warmth  = (Math.sin(t * 0.22 + 1.2) + 1) / 2;

  const hue = 28 + warmth * 14;
  const sat = 78 + breath * 10;

  return (
    <div className="al-stage-convo">
      <div className="al-blob-convo" style={{
        width:  `${380 + breath * 36}px`,
        height: `${360 + breath * 32}px`,
        background: `hsl(${hue - 10}, ${sat - 20}%, 60%)`,
        opacity: 0.18 + breath * 0.09,
        filter: "blur(76px)",
      }} />
      <div className="al-blob-convo" style={{
        width:  `${248 + breath * 28}px`,
        height: `${234 + breath * 22}px`,
        background: `hsl(${hue - 2}, ${sat - 10}%, 52%)`,
        opacity: 0.30 + breath * 0.16,
        filter: "blur(46px)",
      }} />
      <div className="al-blob-convo" style={{
        width:  `${148 + breath * 22 + attend * 6}px`,
        height: `${140 + breath * 18 + attend * 5}px`,
        background: `hsl(${hue + 4}, ${sat}%, 56%)`,
        opacity: 0.54 + breath * 0.18,
        filter: "blur(24px)",
      }} />
      <div className="al-blob-convo" style={{
        width:  `${64 + breath * 12 + attend * 8}px`,
        height: `${60 + breath * 10 + attend * 6}px`,
        background: `hsl(${hue + 8}, ${sat + 4}%, 72%)`,
        opacity: 0.62 + breath * 0.20 + attend * 0.08,
        filter: "blur(10px)",
      }} />
      <div className="al-blob-convo" style={{
        width:  `${18 + breath * 5}px`,
        height: `${16 + breath * 4}px`,
        background: "#fff8ee",
        opacity: 0.70 + breath * 0.24,
        filter: "blur(3px)",
      }} />
    </div>
  );
}

export function ConvoLight() {
  return (
    <div className="convo-root convo-root-light">
      <AmbientLightConvo />
      <p className="convo-sentence">
        That sounds like a beautiful memory, Marko.
      </p>
      <span className="convo-ring" />
    </div>
  );
}
