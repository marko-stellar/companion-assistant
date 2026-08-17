import "./logo.css";

// Light theme — the glow is slightly deeper/saturated so it holds
// against warm linen, same construction as dark.
function Glow({ scale = 1 }: { scale?: number }) {
  const s = (n: number) => `${n * scale}px`;
  return (
    <>
      <div className="logo-glow" style={{
        width: s(150), height: s(150),
        background: "radial-gradient(circle, hsla(32,65%,55%,0.28) 0%, transparent 68%)",
      }} />
      <div className="logo-glow" style={{
        width: s(96), height: s(96),
        background: "radial-gradient(circle, hsla(34,80%,52%,0.65) 0%, transparent 66%)",
      }} />
      <div className="logo-glow" style={{
        width: s(46), height: s(46),
        background: "radial-gradient(circle, hsla(38,92%,66%,0.95) 0%, transparent 64%)",
      }} />
      <div className="logo-glow" style={{
        width: s(14), height: s(14),
        background: "radial-gradient(circle, #fff8ee 0%, hsla(42,100%,84%,0.6) 55%, transparent 75%)",
      }} />
    </>
  );
}

// App-icon tile keeps the dark ground even in light theme — the
// glow needs a night to live in.
function GlowDark({ scale = 1 }: { scale?: number }) {
  const s = (n: number) => `${n * scale}px`;
  return (
    <>
      <div className="logo-glow" style={{
        width: s(150), height: s(150),
        background: "radial-gradient(circle, hsla(34,70%,40%,0.35) 0%, transparent 68%)",
      }} />
      <div className="logo-glow" style={{
        width: s(96), height: s(96),
        background: "radial-gradient(circle, hsla(36,85%,58%,0.75) 0%, transparent 66%)",
      }} />
      <div className="logo-glow" style={{
        width: s(46), height: s(46),
        background: "radial-gradient(circle, hsla(40,95%,74%,0.95) 0%, transparent 64%)",
      }} />
      <div className="logo-glow" style={{
        width: s(14), height: s(14),
        background: "radial-gradient(circle, #fffdf8 0%, hsla(42,100%,88%,0.6) 55%, transparent 75%)",
      }} />
    </>
  );
}

export function LogoLight() {
  return (
    <div className="logo-root logo-root-light">

      <div className="logo-lockup">
        <div className="logo-mark">
          <span className="logo-ring" />
          <Glow />
        </div>
        <p className="logo-wordmark">
          companion
        </p>
      </div>

      <div className="logo-variants">
        <div className="logo-variant">
          <div className="logo-mark-sm">
            <span className="logo-ring" />
            <Glow scale={0.36} />
          </div>
          <span className="logo-variant-label">mark only</span>
        </div>

        <div className="logo-variant">
          <div className="logo-horizontal">
            <div className="logo-mark-sm">
              <span className="logo-ring" />
              <Glow scale={0.36} />
            </div>
            <p className="logo-wordmark">companion</p>
          </div>
          <span className="logo-variant-label">horizontal lockup</span>
        </div>

        <div className="logo-variant">
          <div className="logo-tile">
            <GlowDark scale={0.34} />
          </div>
          <span className="logo-variant-label">app icon</span>
        </div>
      </div>

    </div>
  );
}
