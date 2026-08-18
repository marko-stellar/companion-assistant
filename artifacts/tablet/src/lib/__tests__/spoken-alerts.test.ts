/**
 * Tests for SpokenAlertController — proactive spoken appointment reminders.
 *
 * Covers the review-critical guarantees:
 *  1. Speaks an in-window alert once; never repeats it this session
 *  2. DND / conversation / offline change DURING synthesis → not spoken,
 *     not marked, and retried successfully on a later tick
 *  3. cancel() (barge-in / cleanup) during synthesis → playback never starts,
 *     alert retried later
 *  4. Transient synthesis failure → retried successfully
 *  5. Blocked playback (autoplay) → not marked, retried
 *  6. DND at tick time → nothing synthesized at all
 */
import { describe, it, expect, vi } from "vitest";
import type { AppointmentAlert } from "@workspace/api-client-react";
import { SpokenAlertController, type SpokenAlertDeps } from "../spoken-alerts";

const NOW = new Date("2026-08-18T10:00:00Z");

function makeAlert(overrides: Partial<AppointmentAlert> = {}): AppointmentAlert {
  return {
    id: "a1",
    title: "Doctor visit",
    startsAtUtc: new Date(NOW.getTime() + 10 * 60_000).toISOString(), // in 10 min
    reminderMinutesBefore: 30,
    ...overrides,
  };
}

interface Harness {
  controller: SpokenAlertController;
  deps: {
    canSpeakNow: ReturnType<typeof vi.fn>;
    synthesize: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    buildText: ReturnType<typeof vi.fn>;
  };
  started: string[]; // texts whose playback actually began
}

function makeHarness(deps: Partial<SpokenAlertDeps> = {}): Harness {
  const started: string[] = [];
  let lastText = "";
  const d = {
    canSpeakNow: vi.fn(() => true),
    buildText: vi.fn((a: { title: string; minutesUntil: number }) => {
      lastText = `${a.title} in ${a.minutesUntil} minutes`;
      return lastText;
    }),
    synthesize: vi.fn(async (_text: string) => ({
      audio: "QUJD",
      mimeType: "audio/mpeg",
    })),
    play: vi.fn(async (_a: string, _m: string, onStarted: () => void) => {
      onStarted();
      started.push(lastText);
    }),
    ...deps,
  };
  return { controller: new SpokenAlertController(d), deps: d as Harness["deps"], started };
}

describe("SpokenAlertController", () => {
  it("speaks an in-window alert once and never repeats it", async () => {
    const h = makeHarness();
    const alerts = [makeAlert()];
    await h.controller.tick(alerts, NOW);
    await h.controller.tick(alerts, NOW);
    await h.controller.tick(alerts, NOW);
    expect(h.deps.synthesize).toHaveBeenCalledTimes(1);
    expect(h.started).toEqual(["Doctor visit in 10 minutes"]);
    expect(h.controller.hasSpoken("a1")).toBe(true);
  });

  it("does not synthesize at all when speaking is not allowed (DND/offline/conversation)", async () => {
    const h = makeHarness({ canSpeakNow: vi.fn(() => false) });
    await h.controller.tick([makeAlert()], NOW);
    expect(h.deps.synthesize).not.toHaveBeenCalled();
  });

  it("ignores alerts outside their reminder window", async () => {
    const h = makeHarness();
    const tooFar = makeAlert({
      startsAtUtc: new Date(NOW.getTime() + 120 * 60_000).toISOString(), // 2 h away, 30-min window
    });
    const started = makeAlert({
      id: "a2",
      startsAtUtc: new Date(NOW.getTime() - 60_000).toISOString(), // already started
    });
    await h.controller.tick([tooFar, started], NOW);
    expect(h.deps.synthesize).not.toHaveBeenCalled();
  });

  it("eligibility lost DURING synthesis → not spoken, not marked, retried successfully later", async () => {
    // canSpeakNow: true at tick start, false after synthesis returns (e.g. DND
    // began or a conversation started), then true again on the retry tick.
    const canSpeakNow = vi
      .fn()
      .mockReturnValueOnce(true) // pre-check, attempt 1
      .mockReturnValueOnce(false) // post-synthesis re-check, attempt 1
      .mockReturnValue(true); // attempt 2 onwards
    const h = makeHarness({ canSpeakNow });
    const alerts = [makeAlert()];

    await h.controller.tick(alerts, NOW);
    expect(h.started).toEqual([]); // suppressed
    expect(h.controller.hasSpoken("a1")).toBe(false); // NOT marked

    await h.controller.tick(alerts, NOW); // window still open → retry
    expect(h.started).toEqual(["Doctor visit in 10 minutes"]);
    expect(h.controller.hasSpoken("a1")).toBe(true);
  });

  it("cancel() during synthesis (barge-in/cleanup) → playback never starts, retried later", async () => {
    let resolveSynth!: (v: { audio: string; mimeType: string }) => void;
    const firstSynth = new Promise<{ audio: string; mimeType: string }>(
      (r) => (resolveSynth = r),
    );
    const synthesize = vi
      .fn()
      .mockReturnValueOnce(firstSynth)
      .mockResolvedValue({ audio: "QUJD", mimeType: "audio/mpeg" });
    const h = makeHarness({ synthesize });
    const alerts = [makeAlert()];

    const tickPromise = h.controller.tick(alerts, NOW);
    h.controller.cancel(); // barge-in while TTS is in flight
    resolveSynth({ audio: "QUJD", mimeType: "audio/mpeg" });
    await tickPromise;

    expect(h.deps.play).not.toHaveBeenCalled();
    expect(h.controller.hasSpoken("a1")).toBe(false);

    await h.controller.tick(alerts, NOW); // retry succeeds
    expect(h.deps.play).toHaveBeenCalledTimes(1);
    expect(h.controller.hasSpoken("a1")).toBe(true);
  });

  it("transient synthesis failure → retried successfully on a later tick", async () => {
    const synthesize = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ audio: "QUJD", mimeType: "audio/mpeg" });
    const h = makeHarness({ synthesize });
    const alerts = [makeAlert()];

    await h.controller.tick(alerts, NOW);
    expect(h.controller.hasSpoken("a1")).toBe(false);

    await h.controller.tick(alerts, NOW);
    expect(h.started).toEqual(["Doctor visit in 10 minutes"]);
    expect(h.controller.hasSpoken("a1")).toBe(true);
  });

  it("blocked playback (onStarted never fires) → not marked, retried later", async () => {
    const play = vi
      .fn()
      .mockImplementationOnce(async () => {
        /* autoplay blocked: resolves without calling onStarted */
      })
      .mockImplementation(async (_a, _m, onStarted: () => void) => {
        onStarted();
      });
    const h = makeHarness({ play });
    const alerts = [makeAlert()];

    await h.controller.tick(alerts, NOW);
    expect(h.controller.hasSpoken("a1")).toBe(false);

    await h.controller.tick(alerts, NOW);
    expect(h.controller.hasSpoken("a1")).toBe(true);
  });

  it("only one alert operation runs at a time", async () => {
    let resolveSynth!: (v: { audio: string; mimeType: string }) => void;
    const synthesize = vi.fn(
      () =>
        new Promise<{ audio: string; mimeType: string }>(
          (r) => (resolveSynth = r),
        ),
    );
    const h = makeHarness({ synthesize });
    const alerts = [makeAlert(), makeAlert({ id: "a2", title: "Dentist" })];

    const t1 = h.controller.tick(alerts, NOW);
    const t2 = h.controller.tick(alerts, NOW); // in-flight guard → no-op
    resolveSynth({ audio: "QUJD", mimeType: "audio/mpeg" });
    await Promise.all([t1, t2]);
    expect(h.deps.synthesize).toHaveBeenCalledTimes(1);
  });
});
