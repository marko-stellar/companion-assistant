import './_group.css';
import { useEffect, useRef, useState } from 'react';

// ── Types (inlined from device-context / api-client) ──────────────────────────

type CompanionState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'dnd' | 'offline';
type VoicePhase = 'idle' | 'recording' | 'uploading' | 'playing';

interface TodayItem {
  id: string;
  time: string;
  title: string;
  type: 'appointment' | 'medication' | 'reminder';
  done: boolean;
  occurrenceId?: string;
}

interface Strings {
  listening: string;
  thinking: string;
  speaking: string;
  dndTitle: string;
  dndSubtitle: string;
  offlineTitle: string;
  offlineSubtitle: string;
  talkButton: string;
  stopListening: string;
  todayLabel: string;
  noItemsToday: string;
  medTaken: string;
  medNotSure: string;
  medNotTaken: string;
  reminderSoon: string;
  reminderMinutes: string;
  errorMicDenied: string;
  errorMicUnavailable: string;
  errorTranscriptionEmpty: string;
  errorLlm: string;
  errorNetwork: string;
}

// ── Static stub data (realistic) ─────────────────────────────────────────────

const STATIC_T: Strings = {
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  dndTitle: 'Do Not Disturb',
  dndSubtitle: 'Tap to wake',
  offlineTitle: 'No connection',
  offlineSubtitle: 'Please check your network',
  talkButton: 'Talk to me',
  stopListening: 'Stop',
  todayLabel: "Today",
  noItemsToday: 'Nothing scheduled for today.',
  medTaken: 'Taken',
  medNotSure: 'Not sure',
  medNotTaken: 'Not taken',
  reminderSoon: 'in',
  reminderMinutes: 'min',
  errorMicDenied: 'Microphone access denied.',
  errorMicUnavailable: 'Microphone unavailable.',
  errorTranscriptionEmpty: 'No speech detected — please try again.',
  errorLlm: 'Something went wrong. Please try again.',
  errorNetwork: 'Network error. Please check your connection.',
};

const STATIC_TODAY_ITEMS: TodayItem[] = [
  { id: '1', time: '8:00', title: 'Morning walk', type: 'reminder', done: true },
  { id: '2', time: '9:30', title: 'Aspirin 100 mg', type: 'medication', done: false, occurrenceId: 'med-occ-1' },
  { id: '3', time: '11:00', title: 'Doctor Horvat — cardiology', type: 'appointment', done: false },
  { id: '4', time: '13:00', title: 'Metoprolol 25 mg', type: 'medication', done: false, occurrenceId: 'med-occ-2' },
  { id: '5', time: '15:00', title: 'Video call with family', type: 'appointment', done: false },
];

const STATIC_COMPANION_STATE: CompanionState = 'idle';
const STATIC_COMPANION_NAME = 'companion';
const STATIC_GREETING = 'Good morning, Marko.';

// ── AmbientOrb (inlined from ambient-orb.tsx) ──────────────────────────────

interface Layer {
  color: [number, number, number];
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  amp: number;
}

const STATE_PALETTES: Record<CompanionState, [number, number, number][]> = {
  idle: [
    [180, 130, 90],
    [120, 90, 70],
    [200, 155, 100],
    [90, 70, 55],
  ],
  listening: [
    [120, 180, 220],
    [80, 140, 200],
    [160, 200, 240],
    [60, 110, 170],
  ],
  thinking: [
    [160, 110, 200],
    [120, 80, 180],
    [200, 150, 220],
    [80, 60, 150],
  ],
  speaking: [
    [90, 200, 160],
    [60, 160, 130],
    [120, 220, 180],
    [50, 130, 110],
  ],
  dnd: [
    [60, 55, 80],
    [50, 45, 70],
    [70, 65, 90],
    [40, 38, 60],
  ],
  offline: [
    [80, 80, 80],
    [60, 60, 60],
    [90, 90, 90],
    [50, 50, 50],
  ],
};

const STATE_SPEEDS: Record<CompanionState, number> = {
  idle: 1,
  listening: 3.2,
  thinking: 2,
  speaking: 2.5,
  dnd: 0.3,
  offline: 0.15,
};

const STATE_AMPS: Record<CompanionState, number> = {
  idle: 0.07,
  listening: 0.22,
  thinking: 0.14,
  speaking: 0.18,
  dnd: 0.03,
  offline: 0.02,
};

function AmbientOrb({
  state,
  size = 280,
  companionName,
}: {
  state: CompanionState;
  size?: number;
  companionName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const layersRef = useRef<Layer[]>([]);
  const stateRef = useRef<CompanionState>(state);
  const rotationRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const palette = STATE_PALETTES[stateRef.current];
    layersRef.current = palette.map((color, i) => ({
      color,
      x: (Math.random() - 0.5) * 0.5,
      y: (Math.random() - 0.5) * 0.5,
      r: 0.28 + Math.random() * 0.2,
      phase: (i / palette.length) * Math.PI * 2,
      speed: 0.7 + Math.random() * 0.6,
      amp: 0,
    }));

    let t = 0;

    const draw = () => {
      const s = stateRef.current;
      const spd = STATE_SPEEDS[s];
      const amp = STATE_AMPS[s];
      const palette2 = STATE_PALETTES[s];
      const cx = size / 2;
      const cy = size / 2;
      const R = size / 2;

      t += 0.016;

      layersRef.current.forEach((l, i) => {
        const tgt = palette2[i] ?? palette2[0];
        l.color = l.color.map((c, ch) => c + (tgt[ch] - c) * 0.025) as [number, number, number];
        l.amp += (amp - l.amp) * 0.04;
      });

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#0e0b08';
      ctx.fillRect(0, 0, size, size);

      if (s === 'thinking') {
        rotationRef.current += 0.008;
      } else {
        rotationRef.current *= 0.96;
      }

      layersRef.current.forEach((l, i) => {
        const breathe = 1 + l.amp * Math.sin(t * spd * l.speed + l.phase);
        const blobR = R * l.r * breathe;
        const rx = Math.cos(rotationRef.current + i * 0.8) * R * 0.32 + cx + l.x * R * breathe;
        const ry = Math.sin(rotationRef.current + i * 0.8) * R * 0.32 + cy + l.y * R * breathe;

        const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, blobR);
        const [r, g, b] = l.color;
        grad.addColorStop(0, `rgba(${r},${g},${b},0.75)`);
        grad.addColorStop(0.6, `rgba(${r},${g},${b},0.3)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.beginPath();
        ctx.arc(rx, ry, blobR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      if (s === 'listening') {
        const pulse = Math.abs(Math.sin(t * spd * 1.5));
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.55 + 0.2 * pulse), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(120,180,220,${0.15 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (s === 'speaking') {
        const bars = 9;
        for (let b = 0; b < bars; b++) {
          const frac = (b + 0.5) / bars;
          const angle = Math.PI * (0.25 + frac * 0.5);
          const barH = 14 + 10 * Math.abs(Math.sin(t * 8 + b * 0.9));
          const bx = cx + Math.cos(Math.PI - angle) * R * 0.72;
          const by = cy + Math.sin(Math.PI - angle) * R * 0.72;
          ctx.fillStyle = 'rgba(90,200,160,0.55)';
          ctx.beginPath();
          ctx.roundRect(bx - 3, by - barH / 2, 6, barH, 3);
          ctx.fill();
        }
      }

      const vig = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, size, size);

      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size]);

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      aria-label={companionName ? `${companionName} companion orb` : 'Companion orb'}
    >
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          filter: 'blur(28px)',
          background:
            state === 'listening'
              ? 'rgba(120,180,220,0.12)'
              : state === 'thinking'
              ? 'rgba(160,110,200,0.12)'
              : state === 'speaking'
              ? 'rgba(90,200,160,0.12)'
              : 'rgba(180,130,90,0.08)',
          transition: 'background 1.2s ease',
        }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, borderRadius: '50%' }}
      />
    </div>
  );
}

// ── Sub-components (inlined from home.tsx) ────────────────────────────────────

function MedicationButtons({
  item,
  t,
}: {
  item: TodayItem;
  t: Strings;
  onRespond: (occurrenceId: string, response: 'YES' | 'UNKNOWN' | 'NO') => void;
}) {
  const [pending, setPending] = useState(false);
  if (!item.occurrenceId) return null;

  const handle = (_response: 'YES' | 'UNKNOWN' | 'NO') => {
    if (pending) return;
    setPending(true);
    // no-op in mockup
  };

  const btnBase =
    'rounded-lg px-3 py-2 text-sm transition-all active:scale-95 shrink-0';

  return (
    <span className="flex items-center gap-2 shrink-0">
      <button
        onClick={() => handle('YES')}
        disabled={pending}
        className={btnBase}
        style={{
          background: 'rgba(110,170,110,0.18)',
          border: '1px solid rgba(110,170,110,0.35)',
          color: 'rgba(180,225,180,0.9)',
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.5 : 1,
        }}
        aria-label={t.medTaken}
      >
        ✓ {t.medTaken}
      </button>
      <button
        onClick={() => handle('UNKNOWN')}
        disabled={pending}
        className={btnBase}
        style={{
          background: 'rgba(200,175,110,0.14)',
          border: '1px solid rgba(200,175,110,0.3)',
          color: 'rgba(230,210,160,0.85)',
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.5 : 1,
        }}
        aria-label={t.medNotSure}
      >
        ? {t.medNotSure}
      </button>
      <button
        onClick={() => handle('NO')}
        disabled={pending}
        className={btnBase}
        style={{
          background: 'rgba(200,90,70,0.14)',
          border: '1px solid rgba(200,90,70,0.3)',
          color: 'rgba(235,175,155,0.85)',
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.5 : 1,
        }}
        aria-label={t.medNotTaken}
      >
        ✗ {t.medNotTaken}
      </button>
    </span>
  );
}

function TodayList({
  items,
  t,
  onRespond,
}: {
  items: TodayItem[];
  t: Strings;
  onRespond: (occurrenceId: string, response: 'YES' | 'UNKNOWN' | 'NO') => void;
}) {
  if (!items.length) {
    return (
      <p
        className="text-center text-base"
        style={{ color: 'rgba(200,175,145,0.45)' }}
      >
        {t.noItemsToday}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 w-full">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            opacity: item.done ? 0.4 : 1,
          }}
        >
          <span
            className="text-sm font-mono shrink-0"
            style={{ color: 'rgba(200,155,90,0.85)', minWidth: 40 }}
          >
            {item.time}
          </span>
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{
              background:
                item.type === 'appointment'
                  ? 'rgba(120,180,220,0.8)'
                  : item.type === 'medication'
                  ? 'rgba(150,200,140,0.8)'
                  : 'rgba(180,130,90,0.8)',
            }}
          />
          <span
            className="text-base flex-1 truncate"
            style={{ color: 'rgba(240,220,195,0.85)', minWidth: 80 }}
          >
            {item.title}
          </span>
          {item.type === 'medication' && !item.done && item.occurrenceId && (
            <MedicationButtons item={item} t={t} onRespond={onRespond} />
          )}
        </li>
      ))}
    </ul>
  );
}

function TalkButton({
  voicePhase,
  isDnd,
  t,
  onClick,
}: {
  voicePhase: VoicePhase;
  isDnd: boolean;
  t: Strings;
  onClick: () => void;
}) {
  const isRecording = voicePhase === 'recording';
  const isUploading = voicePhase === 'uploading';
  const isDisabled = isDnd || isUploading;

  const buttonBg = isDnd
    ? 'rgba(180,130,90,0.15)'
    : isRecording
    ? 'rgba(200,80,60,0.75)'
    : isUploading
    ? 'rgba(180,130,90,0.3)'
    : 'rgba(180,130,90,0.82)';

  const buttonColor =
    isDnd || isUploading ? 'rgba(240,210,170,0.3)' : 'rgba(255,240,215,0.95)';

  const label = isRecording ? t.stopListening : isUploading ? '…' : t.talkButton;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className="w-full rounded-2xl py-7 text-2xl tracking-wide transition-all active:scale-[0.97]"
      style={{
        background: buttonBg,
        color: buttonColor,
        border: isRecording ? '2px solid rgba(220,100,70,0.5)' : 'none',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        letterSpacing: '0.04em',
        boxShadow:
          isDisabled || isUploading
            ? 'none'
            : isRecording
            ? '0 4px 40px rgba(200,80,60,0.3)'
            : '0 4px 40px rgba(180,130,90,0.25)',
        animation: isRecording ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }}
      aria-label={label}
      aria-pressed={isRecording}
    >
      {isRecording ? (
        <span className="flex items-center justify-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: 'rgba(255,100,70,0.9)' }}
          />
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function Current() {
  const companionState = STATIC_COMPANION_STATE;
  const companionName = STATIC_COMPANION_NAME;
  const greeting = STATIC_GREETING;
  const t = STATIC_T;
  const todayItems = STATIC_TODAY_ITEMS;
  const voicePhase: VoicePhase = 'idle';
  const isDnd = companionState === 'dnd';
  const orbSize = 220; // landscape size

  return (
    <div
      style={{
        width: 1194,
        height: 834,
        background: '#0e0b08',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Landscape layout — 3 column */}
      <div className="flex items-stretch" style={{ height: '100%' }}>
        {/* Left: greeting + today list */}
        <div
          className="flex flex-col justify-between px-8 py-8 gap-4"
          style={{ width: '36%' }}
        >
          {/* Header */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(200,155,90,0.14)' }}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ background: 'rgba(200,155,90,0.8)' }}
                />
              </div>
              <p
                className="text-xl italic font-light tracking-wide lowercase"
                style={{
                  fontFamily: 'Georgia, serif',
                  color: 'rgba(200,155,90,0.75)',
                }}
              >
                {companionName}
              </p>
            </div>
            <h1
              className="text-2xl leading-tight"
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: 'italic',
                color: 'rgba(255,235,200,0.88)',
              }}
            >
              {greeting}
            </h1>
          </div>

          {/* Today list */}
          <div className="flex flex-col gap-3 flex-1 mt-4">
            <p
              className="text-xs tracking-[0.2em] uppercase"
              style={{ color: 'rgba(200,155,90,0.5)' }}
            >
              {t.todayLabel}
            </p>
            <TodayList
              items={todayItems}
              t={t}
              onRespond={() => {}}
            />
          </div>
        </div>

        {/* Center: ambient orb */}
        <div
          className="flex flex-col items-center justify-center gap-4 relative"
          style={{ width: '28%' }}
        >
          <AmbientOrb
            state={companionState}
            size={orbSize}
            companionName={companionName}
          />
          {/* StateLabel — idle shows nothing */}
        </div>

        {/* Right: Talk button */}
        <div
          className="flex flex-col items-center justify-center gap-3 px-8"
          style={{ width: '36%' }}
        >
          <div style={{ width: '100%', maxWidth: 280 }}>
            <TalkButton
              voicePhase={voicePhase}
              isDnd={isDnd}
              t={t}
              onClick={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
