import { useState, useRef, type FormEvent } from "react";
import { setupDevice } from "@/lib/device-api";
import { getStrings } from "@/lib/i18n";

interface SetupPageProps {
  onComplete: () => void;
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
      onComplete();
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8"
      style={{ background: "#0e0b08" }}
    >
      {/* Ambient blobs */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute rounded-full opacity-20"
          style={{
            width: 480,
            height: 480,
            top: "-120px",
            right: "-80px",
            background:
              "radial-gradient(circle, rgba(180,130,90,0.6) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute rounded-full opacity-15"
          style={{
            width: 320,
            height: 320,
            bottom: "60px",
            left: "-60px",
            background:
              "radial-gradient(circle, rgba(120,90,70,0.7) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-10">
        {/* Logo / wordmark */}
        <div className="text-center">
          <h1
            className="text-5xl tracking-widest font-light mb-2"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
              color: "rgba(255,235,200,0.92)",
            }}
          >
            COMPANION
          </h1>
          <p
            className="text-sm tracking-[0.25em] uppercase"
            style={{ color: "rgba(200,175,145,0.55)" }}
          >
            Device Setup
          </p>
        </div>

        {/* Card */}
        <div
          className="w-full rounded-2xl p-8 flex flex-col gap-6"
          style={{
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(12px)",
          }}
        >
          <p
            className="text-center text-base leading-relaxed"
            style={{ color: "rgba(220,195,165,0.75)" }}
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
              className="w-full text-center text-3xl tracking-[0.4em] font-mono rounded-xl px-4 py-5 outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: error
                  ? "1.5px solid rgba(220,100,80,0.7)"
                  : "1.5px solid rgba(255,255,255,0.12)",
                color: "rgba(255,235,200,0.95)",
                caretColor: "rgba(200,155,90,0.8)",
              }}
              aria-label="Setup code"
              disabled={loading}
            />

            {error && (
              <p
                className="text-center text-sm"
                style={{ color: "rgba(220,100,80,0.9)" }}
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.trim().length < 6}
              className="w-full rounded-xl py-5 text-lg font-medium tracking-wide transition-all active:scale-[0.98]"
              style={{
                background:
                  loading || code.trim().length < 6
                    ? "rgba(180,130,90,0.25)"
                    : "rgba(180,130,90,0.85)",
                color:
                  loading || code.trim().length < 6
                    ? "rgba(255,235,200,0.35)"
                    : "rgba(255,235,200,0.95)",
                border: "none",
                cursor:
                  loading || code.trim().length < 6
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {loading ? t.setupLoading : t.setupButton}
            </button>
          </form>
        </div>

        <p
          className="text-center text-xs"
          style={{ color: "rgba(200,175,145,0.35)" }}
        >
          The code expires after 24 hours.
          <br />
          Ask your caregiver for a new one if needed.
        </p>
      </div>
    </div>
  );
}
