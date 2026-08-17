import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

/** Small warm glow — lighter version for the admin light-mode panel */
function AmbientGlow() {
  const midRef  = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const rafRef  = useRef<number>(0);
  const t0Ref   = useRef<number | null>(null);

  useEffect(() => {
    const tick = (ts: number) => {
      if (!t0Ref.current) t0Ref.current = ts;
      const t = (ts - t0Ref.current) / 1000;
      const breath = (Math.sin(t * 0.38) + 1) / 2;
      if (midRef.current) {
        midRef.current.style.width  = `${130 + breath * 18}px`;
        midRef.current.style.height = `${120 + breath * 15}px`;
        midRef.current.style.opacity = String(0.28 + breath * 0.12);
      }
      if (coreRef.current) {
        coreRef.current.style.width  = `${55 + breath * 12}px`;
        coreRef.current.style.height = `${50 + breath * 10}px`;
        coreRef.current.style.opacity = String(0.40 + breath * 0.18);
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
    <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
      <div ref={midRef}  style={{ ...blob, background: 'hsl(30,65%,55%)', filter: 'blur(28px)' }} />
      <div ref={coreRef} style={{ ...blob, background: 'hsl(38,80%,70%)', filter: 'blur(10px)' }} />
    </div>
  );
}

function SetupScreen() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#f5f0e8',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      gap: 0, overflow: 'hidden',
    }}>
      <AmbientGlow />

      <p style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontStyle: 'italic', fontWeight: 300, fontSize: 38,
        color: '#2a221a', letterSpacing: '0.06em',
        margin: '24px 0 8px', lineHeight: 1,
      }}>
        companion
      </p>

      <p style={{
        fontWeight: 400, fontSize: 11,
        letterSpacing: '0.24em', textTransform: 'lowercase',
        color: '#9a8060', margin: '0 0 4px',
      }}>
        admin
      </p>

      <p style={{
        fontWeight: 300, fontSize: 12,
        letterSpacing: '0.18em', textTransform: 'lowercase',
        color: '#c4b090', margin: 0,
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
