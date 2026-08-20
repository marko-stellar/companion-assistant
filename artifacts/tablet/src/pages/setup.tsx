import { useState, useRef, type FormEvent } from "react";
import { setupDevice } from "@/lib/device-api";
import { getStrings } from "@/lib/i18n";

interface SetupPageProps {
  onComplete: () => void | Promise<void>;
}

export function SetupPage({ onComplete }: SetupPageProps) {
  const t = getStrings("en"); // setup always in English (language unknown before auth)
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) return;

    setError(null);
    setLoading(true);

    try {
      await setupDevice(trimmed);
      await onComplete();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Setup failed";
      setError(msg.includes("expired") || msg.includes("Invalid")
        ? t.setupError
        : msg);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const isReady = !loading && code.trim().length >= 6;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8"
      style={{ background: "#0e0b08" }}
    >
      {/* ── Ambient atmosphere blobs — same organic warmth as the home screen ── */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        {/* Top-right warm bloom */}
        <div
          className="absolute rounded-full"
          style={{
            width: 480,
            height: 480,
            top: "-120px",
            right: "-80px",
            background: "radial-gradient(circle, rgba(180,130,90,0.6) 0%, transparent 70%)",
            filter: "blur(72px)",
            opacity: 0.18,
          }}
        />
        {/* Bottom-left dim ember */}
        <div
          className="absolute rounded-full"
          style={{
            width: 320,
            height: 320,
            bottom: "60px",
            left: "-60px",
            background: "radial-gradient(circle, rgba(120,90,70,0.7) 0%, transparent 70%)",
            filter: "blur(56px)",
            opacity: 0.14,
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-10">

        {/* ── Logo / wordmark — LogoDark lockup ── */}
        <div className="flex flex-col items-center" style={{ gap: 40 }}>
          {/* The mark: outer hairline ring + layered radial glow + inner spark */}
          <div
            className="relative flex items-center justify-center"
            style={{ width: 180, height: 180 }}
          >
            {/* Hairline ring — the vessel */}
            <span
              className="absolute inset-0 rounded-full"
              style={{ border: "1px solid #4a3a22" }}
            />
            {/* Outer atmosphere glow */}
            <span
              className="absolute rounded-full"
              style={{
                width: 150,
                height: 150,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle, hsla(34,70%,40%,0.35) 0%, transparent 68%)",
                borderRadius: "50%",
              }}
            />
            {/* Mid bloom */}
            <span
              className="absolute rounded-full"
              style={{
                width: 96,
                height: 96,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle, hsla(36,85%,58%,0.75) 0%, transparent 66%)",
                borderRadius: "50%",
              }}
            />
            {/* Core */}
            <span
              className="absolute rounded-full"
              style={{
                width: 46,
                height: 46,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle, hsla(40,95%,74%,0.95) 0%, transparent 64%)",
                borderRadius: "50%",
              }}
            />
            {/* Hot point */}
            <span
              className="absolute rounded-full"
              style={{
                width: 14,
                height: 14,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "radial-gradient(circle, #fffdf8 0%, hsla(42,100%,88%,0.6) 55%, transparent 75%)",
                borderRadius: "50%",
              }}
            />
          </div>

          {/* Wordmark — matches logo.css */}
          <div className="text-center">
            <p
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontSize: "4rem",
                letterSpacing: "0.06em",
                lineHeight: 1,
                color: "#e8dcc0",
                margin: "0 0 16px 0",
              }}
            >
              companion
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                fontSize: "0.625rem",
                letterSpacing: "0.24em",
                textTransform: "lowercase",
                color: "#5a4830",
                margin: 0,
              }}
            >
              device setup
            </p>
          </div>
        </div>

        {/* ── Setup card ── */}
        <div
          className="w-full rounded-2xl flex flex-col gap-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
            padding: "2rem",
          }}
        >
          <p
            className="text-center leading-relaxed"
            style={{
              color: "rgba(176,160,122,0.75)",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
              fontSize: "1.1rem",
            }}
          >
            {t.setupSubtitle}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))
              }
              placeholder={t.setupCodePlaceholder}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              maxLength={8}
              className="w-full text-center tracking-[0.4em] font-mono rounded-2xl outline-none transition-all"
              style={{
                fontSize: "1.875rem",
                padding: "1.25rem 1rem",
                background: "rgba(255,255,255,0.05)",
                border: error
                  ? "1px solid rgba(200,90,70,0.6)"
                  : "1px solid rgba(255,255,255,0.10)",
                color: "#fffdf8",
                caretColor: "rgba(200,155,90,0.8)",
              }}
              aria-label="Setup code"
              disabled={loading}
            />

            {error && (
              <p
                className="text-center text-sm"
                style={{
                  color: "rgba(220,100,80,0.9)",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "1rem",
                }}
                role="alert"
              >
                {error}
              </p>
            )}

            {/* Submit — same pill style as companion.css .talk-button */}
            <button
              type="submit"
              disabled={!isReady}
              className="w-full transition-all active:scale-[0.98]"
              style={{
                borderRadius: 60,
                padding: "22px 0",
                background: "#120e08",
                boxShadow: isReady
                  ? "0 0 0 1px #a06828, 0 0 32px 8px #a0682822, inset 0 1px 0 #ffffff08"
                  : "0 0 0 1px #3a2e1e",
                border: "none",
                cursor: isReady ? "pointer" : "not-allowed",
                outline: "none",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            >
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 400,
                  fontSize: "1rem",
                  letterSpacing: "0.32em",
                  color: isReady ? "#b07a3a" : "rgba(176,122,58,0.3)",
                  textTransform: "uppercase",
                }}
              >
                {loading ? t.setupLoading : t.setupButton}
              </span>
            </button>
          </form>
        </div>

        {/* Fine print */}
        <p
          className="text-center"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 300,
            fontSize: "0.7rem",
            letterSpacing: "0.04em",
            color: "#5a4830",
            lineHeight: 1.6,
          }}
        >
          The code expires after 24 hours.
          <br />
          Ask your caregiver for a new one if needed.
        </p>
      </div>
    </div>
  );
}
