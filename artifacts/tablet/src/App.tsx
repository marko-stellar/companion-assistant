import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

/** Animate the ambient light glow — same sine-breath technique as the design system */
function AmbientLight() {
  const outerRef = useRef<HTMLDivElement>(null);
  const midRef   = useRef<HTMLDivElement>(null);
  const coreRef  = useRef<HTMLDivElement>(null);
  const hotRef   = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);
  const t0Ref    = useRef<number | null>(null);

  useEffect(() => {
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const t = (ts - t0Ref.current) / 1000;
      const breath  = (Math.sin(t * 0.42) + 1) / 2;
      const warmth  = (Math.sin(t * 0.18 + 1.2) + 1) / 2;
      const hue = 28 + warmth * 12;

      if (outerRef.current) {
        outerRef.current.style.width  = `${340 + breath * 30}px`;
        outerRef.current.style.height = `${320 + breath * 28}px`;
        outerRef.current.style.background = `hsl(${hue - 8},60%,18%)`;
        outerRef.current.style.opacity = String(0.32 + breath * 0.12);
      }
      if (midRef.current) {
        midRef.current.style.width  = `${200 + breath * 24}px`;
        midRef.current.style.height = `${190 + breath * 20}px`;
        midRef.current.style.background = `hsl(${hue},78%,42%)`;
        midRef.current.style.opacity = String(0.52 + breath * 0.20);
      }
      if (coreRef.current) {
        coreRef.current.style.width  = `${92 + breath * 18}px`;
        coreRef.current.style.height = `${86 + breath * 15}px`;
        coreRef.current.style.background = `hsl(${hue + 4},88%,66%)`;
        coreRef.current.style.opacity = String(0.72 + breath * 0.20);
      }
      if (hotRef.current) {
        hotRef.current.style.width  = `${22 + breath * 6}px`;
        hotRef.current.style.height = `${20 + breath * 5}px`;
        hotRef.current.style.opacity = String(0.75 + breath * 0.22);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const blob: React.CSSProperties = {
    position: 'absolute', top: '50%', left: '50%',
    translate: '-50% -50%', borderRadius: '50%',
    willChange: 'width, height, opacity',
  };

  return (
    <div style={{ position: 'relative', width: 360, height: 360, flexShrink: 0 }}>
      <div ref={outerRef} style={{ ...blob, filter: 'blur(72px)' }} />
      <div ref={midRef}   style={{ ...blob, filter: 'blur(36px)' }} />
      <div ref={coreRef}  style={{ ...blob, filter: 'blur(16px)' }} />
      <div ref={hotRef}   style={{ ...blob, background: '#fffdf8', filter: 'blur(4px)' }} />
    </div>
  );
}

function SetupScreen() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0e0b08',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      gap: 0, overflow: 'hidden',
    }}>
      <AmbientLight />

      <p style={{
        fontStyle: 'italic', fontWeight: 300, fontSize: 52,
        color: '#d4c4a0', letterSpacing: '0.06em',
        margin: '32px 0 16px', lineHeight: 1,
      }}>
        companion
      </p>

      <p style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 300, fontSize: 13,
        letterSpacing: '0.22em', textTransform: 'lowercase',
        color: '#5a4830', margin: 0,
      }}>
        setup in progress
      </p>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SetupScreen />
    </QueryClientProvider>
  );
}
