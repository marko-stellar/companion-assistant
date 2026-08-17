import { useEffect, useState } from "react";
import "./settings.css";

function AmbientLightSettings() {
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

  const breath = (Math.sin(t * 0.38) + 1) / 2;
  const hue = 30 + (Math.sin(t * 0.20) + 1) / 2 * 8;

  return (
    <div className="al-stage-settings">
      <div className="al-blob-settings" style={{
        width:  `${100 + breath * 16}px`,
        height: `${94  + breath * 14}px`,
        background: `hsl(${hue - 8}, 58%, 58%)`,
        opacity: 0.22 + breath * 0.10,
        filter: "blur(22px)",
      }} />
      <div className="al-blob-settings" style={{
        width:  `${58 + breath * 10}px`,
        height: `${54 + breath * 8}px`,
        background: `hsl(${hue}, 70%, 52%)`,
        opacity: 0.38 + breath * 0.18,
        filter: "blur(10px)",
      }} />
      <div className="al-blob-settings" style={{
        width:  `${26 + breath * 5}px`,
        height: `${24 + breath * 4}px`,
        background: `hsl(${hue + 8}, 76%, 64%)`,
        opacity: 0.55 + breath * 0.22,
        filter: "blur(4px)",
      }} />
      <div className="al-blob-settings" style={{
        width:  `${8 + breath * 2}px`,
        height: `${7  + breath * 2}px`,
        background: "#fff8ee",
        opacity: 0.68 + breath * 0.24,
        filter: "blur(1.5px)",
      }} />
    </div>
  );
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}

function Card({ label, value, sub, className = "" }: CardProps) {
  return (
    <div className={`settings-card ${className}`}>
      <div className="settings-card-top">
        <span className="settings-label">{label}</span>
        <span className="settings-tap-dot" />
      </div>
      <div>
        <p className="settings-value">{value}</p>
        {sub && <span className="settings-subvalue">{sub}</span>}
      </div>
    </div>
  );
}

export function SettingsLight() {
  return (
    <div className="settings-root settings-root-light">

      {/* Header */}
      <div className="settings-header">
        <AmbientLightSettings />
        <p className="settings-title">your preferences</p>
      </div>

      {/* Cards grid */}
      <div className="settings-grid">
        <Card
          label="language"
          value="English"
          sub="display & voice"
        />
        <Card
          label="companion"
          value="Marko"
          sub="your name"
        />
        <Card
          label="voice"
          value="Warm · Slow"
          sub="companion voice"
        />
        <Card
          label="do not disturb"
          value="Off"
          sub="available all day"
          className="settings-dnd-off"
        />
        <Card
          label="emergency contact"
          value="Elena"
          sub="+385 91 234 5678"
          className="settings-card-emergency"
        />
      </div>

    </div>
  );
}
