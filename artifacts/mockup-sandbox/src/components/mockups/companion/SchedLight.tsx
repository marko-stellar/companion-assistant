import { useEffect, useState } from "react";
import "./schedule.css";

// ─── Ambient Light — Schedule (Light) ─────────────────────────
function AmbientLightSchedule() {
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

  const breath = (Math.sin(t * 0.44) + 1) / 2;
  const warmth = (Math.sin(t * 0.24 + 1.1) + 1) / 2;
  const hue = 28 + warmth * 10;
  const sat = 74 + breath * 10;

  return (
    <div className="al-stage-sched">
      {/* Outer atmosphere */}
      <div className="al-blob-sched" style={{
        width:  `${270 + breath * 28}px`,
        height: `${256 + breath * 24}px`,
        background: `hsl(${hue - 8}, ${sat - 18}%, 62%)`,
        opacity: 0.16 + breath * 0.08,
        filter: "blur(64px)",
      }} />
      {/* Mid bloom */}
      <div className="al-blob-sched" style={{
        width:  `${178 + breath * 20}px`,
        height: `${168 + breath * 16}px`,
        background: `hsl(${hue}, ${sat - 8}%, 54%)`,
        opacity: 0.28 + breath * 0.14,
        filter: "blur(36px)",
      }} />
      {/* Core */}
      <div className="al-blob-sched" style={{
        width:  `${106 + breath * 16}px`,
        height: `${100 + breath * 12}px`,
        background: `hsl(${hue + 4}, ${sat}%, 58%)`,
        opacity: 0.52 + breath * 0.18,
        filter: "blur(18px)",
      }} />
      {/* Inner spark */}
      <div className="al-blob-sched" style={{
        width:  `${42 + breath * 8}px`,
        height: `${38 + breath * 6}px`,
        background: `hsl(${hue + 10}, ${sat + 4}%, 76%)`,
        opacity: 0.60 + breath * 0.22,
        filter: "blur(8px)",
      }} />
      {/* Hot point */}
      <div className="al-blob-sched" style={{
        width:  `${14 + breath * 4}px`,
        height: `${12 + breath * 3}px`,
        background: "#fff8ee",
        opacity: 0.66 + breath * 0.24,
        filter: "blur(3px)",
      }} />
    </div>
  );
}

// ─── Events ───────────────────────────────────────────────────
type EventStatus = "past" | "now" | "future";

interface ScheduleEvent {
  time: string;
  name: string;
  status: EventStatus;
}

const EVENTS: ScheduleEvent[] = [
  { time: "9:00",  name: "Morning walk",          status: "past"   },
  { time: "10:30", name: "Physical therapy",       status: "now"    },
  { time: "12:30", name: "Lunch with Elena",       status: "future" },
  { time: "15:00", name: "Rest",                   status: "future" },
  { time: "17:00", name: "Video call with family", status: "future" },
];

export function SchedLight() {
  return (
    <div className="sched-root sched-root-light">

      {/* Left — light */}
      <div className="sched-light-col">
        <AmbientLightSchedule />
      </div>

      {/* Right — events */}
      <div className="sched-events-col">
        <p className="sched-header">today</p>

        <div className="sched-thread">
          {EVENTS.map((ev) => (
            <div
              key={ev.time}
              className={`sched-event sched-event-${ev.status}`}
            >
              <span className="sched-dot" />
              <span className="sched-time">{ev.time}</span>
              <span className="sched-name">{ev.name}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
