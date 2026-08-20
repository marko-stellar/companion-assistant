import { type ReactNode, useEffect, useRef, useState } from "react";
import type { CompanionState } from "@/contexts/device-context";

interface AmbientOrbProps {
  state: CompanionState;
  /** Orb diameter in px (default 280) */
  size?: number;
  companionName?: string;
}

interface BlobLayer {
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

function ApprovedAmbientStage({
  width,
  height,
  scale,
  children,
}: {
  width: number;
  height: number;
  scale: number;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: width * scale,
        height: height * scale,
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}

function approvedBlobStyle(
  width: number,
  height: number,
  background: string,
  opacity: number,
  blur: number,
  scale: number,
  transform = "",
) {
  return {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    width: width * scale,
    height: height * scale,
    borderRadius: "50%",
    background,
    opacity,
    filter: `blur(${blur * scale}px)`,
    transform: `translate(-50%, -50%) ${transform}`,
    transformOrigin: "center center",
    willChange: "width, height, opacity, filter, transform",
    pointerEvents: "none" as const,
  };
}

// ── Approved idle animation ──────────────────────────────────────────────────
// Faithful responsive port of the selected HomeScreen mockup. The size scaling
// preserves the 400 × 380px stage at the portrait reference size (240px).

function IdleAmbientLight({ size }: { size: number }) {
  const [t, setT] = useState(0);
  const scale = size / 240;

  useEffect(() => {
    let raf = 0;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      setT((ts - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Three non-harmonic breaths plus a slow warmth drift.
  const A = (Math.sin(t * 0.38) + 1) / 2;
  const B = (Math.sin(t * 0.23 + 1.1) + 1) / 2;
  const C = (Math.sin(t * 0.59 + 2.3) + 1) / 2;
  const D = (Math.sin(t * 0.14 + 0.8) + 1) / 2;
  const hue = 28 + D * 16;

  return (
    <ApprovedAmbientStage width={400} height={380} scale={scale}>
      <div
        style={approvedBlobStyle(
          340 + A * 40,
          320 + B * 36,
          `hsl(${hue - 10}, 70%, 28%)`,
          0.28 + C * 0.12,
          72,
          scale,
          `scale(${0.96 + B * 0.08})`,
        )}
      />
      <div
        style={approvedBlobStyle(
          220 + B * 30,
          210 + A * 28,
          `hsl(${hue - 4}, 80%, 48%)`,
          0.42 + A * 0.2,
          48,
          scale,
          `scale(${0.92 + A * 0.12})`,
        )}
      />
      <div
        style={approvedBlobStyle(
          130 + A * 24,
          124 + B * 20,
          `hsl(${hue + 2}, 88%, 68%)`,
          0.72 + A * 0.22,
          28,
          scale,
          `scale(${0.88 + A * 0.16})`,
        )}
      />
      <div
        style={approvedBlobStyle(
          56 + A * 12,
          54 + A * 10,
          `hsl(${hue + 6}, 95%, 88%)`,
          0.65 + A * 0.3,
          10,
          scale,
          `scale(${0.84 + A * 0.18})`,
        )}
      />
      <div
        style={approvedBlobStyle(
          18 + A * 6,
          16 + A * 5,
          "#fffdf8",
          0.55 + A * 0.38,
          4,
          scale,
          `scale(${0.8 + A * 0.22})`,
        )}
      />
    </ApprovedAmbientStage>
  );
}

// ── Approved speaking animation ──────────────────────────────────────────────
// Faithful responsive port of SpeakDark. The companion responds through a
// languid light exhale and warmth shift, not an audio-waveform metaphor.

function SpeakingAmbientLight({ size }: { size: number }) {
  const [t, setT] = useState(0);
  const scale = size / 240;

  useEffect(() => {
    let raf = 0;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      setT((ts - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const breath = (Math.sin(t * 0.78) + 1) / 2;
  const warmth = (Math.sin(t * 0.35 + 0.5) + 1) / 2;
  const shimmer = (Math.sin(t * 2.1 + 1.2) + 1) / 2;
  const hue = 26 + warmth * 18;
  const saturation = 78 + breath * 14;

  return (
    <ApprovedAmbientStage width={400} height={400} scale={scale}>
      <div
        style={approvedBlobStyle(
          360 + breath * 28 + shimmer * 4,
          342 + breath * 24 + shimmer * 3,
          `hsl(${hue - 10}, ${saturation - 16}%, 28%)`,
          0.26 + breath * 0.1,
          72,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          230 + breath * 22,
          218 + breath * 18,
          `hsl(${hue - 4}, ${saturation - 6}%, 50%)`,
          0.44 + breath * 0.18,
          44,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          140 + breath * 18 + shimmer * 3,
          132 + breath * 14 + shimmer * 2,
          `hsl(${hue + 2}, ${saturation}%, 66%)`,
          0.76 + breath * 0.18,
          24,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          58 + breath * 10,
          54 + breath * 8,
          `hsl(${hue + 8}, ${saturation + 4}%, 84%)`,
          0.68 + breath * 0.24 + shimmer * 0.06,
          10,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          18 + breath * 5,
          16 + breath * 4,
          "#fffdf8",
          0.62 + breath * 0.3,
          4,
          scale,
        )}
      />
    </ApprovedAmbientStage>
  );
}

// ── Approved thinking animation ───────────────────────────────────────────────
// Adapted from the approved ConvoDark treatment: warm, attentive, and slower
// than listening so "Razmišljam…" feels engaged without reading as speech.

function ThinkingAmbientLight({ size }: { size: number }) {
  const [t, setT] = useState(0);
  const scale = size / 240;

  useEffect(() => {
    let raf = 0;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      setT((ts - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Long breath, shorter attention flicker, and very slow warmth drift.
  const breath = (Math.sin(t * 0.5) + 1) / 2;
  const attend = (Math.sin(t * 1.1 + 0.4) + 1) / 2;
  const warmth = (Math.sin(t * 0.22 + 1.2) + 1) / 2;
  const hue = 28 + warmth * 14;
  const saturation = 80 + breath * 10;

  return (
    <ApprovedAmbientStage width={400} height={400} scale={scale}>
      <div
        style={approvedBlobStyle(
          380 + breath * 36,
          360 + breath * 32,
          `hsl(${hue - 10}, ${saturation - 22}%, 22%)`,
          0.3 + breath * 0.12,
          72,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          248 + breath * 28,
          234 + breath * 22,
          `hsl(${hue - 4}, ${saturation - 12}%, 40%)`,
          0.44 + breath * 0.18,
          44,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          148 + breath * 22 + attend * 6,
          140 + breath * 18 + attend * 5,
          `hsl(${hue + 2}, ${saturation}%, 60%)`,
          0.76 + breath * 0.16,
          24,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          64 + breath * 12 + attend * 8,
          60 + breath * 10 + attend * 6,
          `hsl(${hue + 6}, ${saturation + 4}%, 76%)`,
          0.72 + breath * 0.18 + attend * 0.08,
          10,
          scale,
        )}
      />
      <div
        style={approvedBlobStyle(
          18 + breath * 5,
          16 + breath * 4,
          "#fffdf8",
          0.68 + breath * 0.26,
          3,
          scale,
        )}
      />
    </ApprovedAmbientStage>
  );
}

// ── Approved listening animation ─────────────────────────────────────────────
// Faithful responsive port of the selected ListenDark mockup.

function ListeningWaveRing({
  delay,
  duration,
  color,
  maxScale,
  startOpacity,
  scale,
}: {
  delay: number;
  duration: number;
  color: string;
  maxScale: number;
  startOpacity: number;
  scale: number;
}) {
  const [progress, setProgress] = useState(
    delay > 0 ? 1 - delay / duration : 0,
  );

  useEffect(() => {
    let raf = 0;
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
  const ringScale = 1 + eased * (maxScale - 1);
  const opacity =
    progress < 0.15
      ? (progress / 0.15) * startOpacity
      : startOpacity * Math.pow(1 - (progress - 0.15) / 0.85, 1.4);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 140 * scale,
        height: 140 * scale,
        borderRadius: "50%",
        border: "1px solid transparent",
        borderColor: color,
        transform: `translate(-50%, -50%) scale(${ringScale})`,
        transformOrigin: "center center",
        willChange: "transform, opacity",
        opacity: Math.max(0, opacity),
        pointerEvents: "none",
      }}
    />
  );
}

function ListeningAmbientLight({ size }: { size: number }) {
  const [t, setT] = useState(0);
  const scale = (size * 2) / 480;

  useEffect(() => {
    let raf = 0;
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
  const hue = 32 + D * 14;

  const blobStyle = (
    width: number,
    height: number,
    background: string,
    opacity: number,
    blur: number,
    transform: string,
  ) => ({
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    width: width * scale,
    height: height * scale,
    borderRadius: "50%",
    background,
    opacity,
    filter: `blur(${blur * scale}px)`,
    transform: `translate(-50%, -50%) ${transform}`,
    transformOrigin: "center center",
    willChange: "width, height, opacity, filter, transform",
    pointerEvents: "none" as const,
  });

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 480 * scale,
        height: 480 * scale,
        transform: "translate(-50%, -50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible",
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      <div
        style={blobStyle(
          400 + A * 52,
          380 + B * 44,
          `hsl(${hue - 10}, 72%, 30%)`,
          0.32 + B * 0.14,
          80,
          `scale(${0.96 + B * 0.08})`,
        )}
      />
      <div
        style={blobStyle(
          260 + B * 36,
          248 + A * 30,
          `hsl(${hue - 2}, 84%, 54%)`,
          0.52 + A * 0.24,
          52,
          `scale(${0.92 + A * 0.12})`,
        )}
      />
      <div
        style={blobStyle(
          156 + A * 28,
          148 + B * 22,
          `hsl(${hue + 4}, 92%, 70%)`,
          0.82 + A * 0.16,
          28,
          `scale(${0.88 + A * 0.16})`,
        )}
      />
      <div
        style={blobStyle(
          68 + A * 14,
          64 + A * 12,
          `hsl(${hue + 8}, 96%, 88%)`,
          0.72 + A * 0.26,
          12,
          `scale(${0.84 + A * 0.18})`,
        )}
      />
      <div
        style={blobStyle(
          22 + A * 7,
          20 + A * 6,
          "#fffdf8",
          0.7 + A * 0.28,
          4,
          `scale(${0.82 + A * 0.2})`,
        )}
      />

      <ListeningWaveRing
        delay={0}
        duration={6}
        color="#c8823088"
        maxScale={3.8}
        startOpacity={0.55}
        scale={scale}
      />
      <ListeningWaveRing
        delay={2}
        duration={6}
        color="#c8823066"
        maxScale={3.8}
        startOpacity={0.45}
        scale={scale}
      />
      <ListeningWaveRing
        delay={4}
        duration={6}
        color="#c8823044"
        maxScale={3.8}
        startOpacity={0.35}
        scale={scale}
      />
    </div>
  );
}

export function AmbientOrb({ state, size = 280, companionName }: AmbientOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const layersRef = useRef<BlobLayer[]>([]);
  const stateRef = useRef<CompanionState>(state);
  const rotationRef = useRef(0);
  const usesApprovedLight =
    state === "idle" ||
    state === "thinking" ||
    state === "listening" ||
    state === "speaking";

  // Update state ref without restarting the loop
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (usesApprovedLight) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Seed layers
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

      // Blend layers toward target palette
      layersRef.current.forEach((l, i) => {
        const tgt = palette2[i] ?? palette2[0];
        l.color = l.color.map((c, ch) =>
          c + (tgt[ch] - c) * 0.025
        ) as [number, number, number];
        l.amp += (amp - l.amp) * 0.04;
      });

      // Clip to circle
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      // Fill dark bg
      ctx.fillStyle = "#0e0b08";
      ctx.fillRect(0, 0, size, size);

      // Thinking mode: slow rotation of all blobs
      if (s === "thinking") {
        rotationRef.current += 0.008;
      } else {
        rotationRef.current *= 0.96;
      }

      // Draw blobs
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

      // Listening: concentric pulse rings
      if (s === "listening") {
        const pulse = Math.abs(Math.sin(t * spd * 1.5));
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.55 + 0.2 * pulse), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(120,180,220,${0.15 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Speaking: waveform arc at bottom
      if (s === "speaking") {
        const bars = 9;
        for (let b = 0; b < bars; b++) {
          const frac = (b + 0.5) / bars;
          const angle = Math.PI * (0.25 + frac * 0.5); // bottom arc
          const barH = 14 + 10 * Math.abs(Math.sin(t * 8 + b * 0.9));
          const bx = cx + Math.cos(Math.PI - angle) * R * 0.72;
          const by = cy + Math.sin(Math.PI - angle) * R * 0.72;
          ctx.fillStyle = "rgba(90,200,160,0.55)";
          ctx.beginPath();
          ctx.roundRect(bx - 3, by - barH / 2, 6, barH, 3);
          ctx.fill();
        }
      }

      // Inner glow vignette
      const vig = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, size, size);

      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, usesApprovedLight]); // re-init when the legacy canvas state is visible

  // Glow color derived from state — transitions smoothly via CSS transition
  const glowColor =
    state === "listening"
      ? "rgba(200,130,48,0.14)"
      : state === "thinking"
      ? "rgba(160,110,200,0.18)"
      : state === "speaking"
      ? "rgba(90,200,160,0.18)"
      : state === "dnd"
      ? "rgba(80,70,110,0.10)"
      : state === "offline"
      ? "rgba(80,80,80,0.08)"
      : "rgba(180,130,90,0.12)";

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      aria-label={companionName ? `${companionName} companion orb` : "Companion orb"}
      role="img"
    >
      {/* Outer halo — bleeds beyond the circle boundary */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: -size * 0.18,
          borderRadius: "50%",
          background: glowColor,
          filter: `blur(${Math.round(size * 0.22)}px)`,
          transition: "background 1.4s ease",
          opacity: usesApprovedLight ? 0 : 1,
        }}
      />
      {/* Hairline ring — the vessel, like logo.css .logo-ring */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          border: "1px solid rgba(74, 58, 34, 0.55)",
          transition: "border-color 1.2s ease",
          opacity: usesApprovedLight ? 0 : 1,
          zIndex: 2,
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          display: "block",
          opacity: usesApprovedLight ? 0 : 1,
          transition: "opacity 0.35s ease",
        }}
      />
      {state === "idle" && <IdleAmbientLight size={size} />}
      {state === "thinking" && <ThinkingAmbientLight size={size} />}
      {state === "listening" && <ListeningAmbientLight size={size} />}
      {state === "speaking" && <SpeakingAmbientLight size={size} />}
    </div>
  );
}
