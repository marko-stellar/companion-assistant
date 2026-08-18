import { useEffect, useRef } from "react";
import type { CompanionState } from "@/contexts/device-context";

interface AmbientOrbProps {
  state: CompanionState;
  /** Orb diameter in px (default 280) */
  size?: number;
  companionName?: string;
}

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

export function AmbientOrb({ state, size = 280, companionName }: AmbientOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const layersRef = useRef<Layer[]>([]);
  const stateRef = useRef<CompanionState>(state);
  const rotationRef = useRef(0);

  // Update state ref without restarting the loop
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
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
  }, [size]); // only re-init if size changes

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      aria-label={companionName ? `${companionName} companion orb` : "Companion orb"}
    >
      {/* Soft glow behind orb */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          filter: "blur(28px)",
          background:
            state === "listening"
              ? "rgba(120,180,220,0.12)"
              : state === "thinking"
              ? "rgba(160,110,200,0.12)"
              : state === "speaking"
              ? "rgba(90,200,160,0.12)"
              : "rgba(180,130,90,0.08)",
          transition: "background 1.2s ease",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, borderRadius: "50%" }}
      />
    </div>
  );
}
