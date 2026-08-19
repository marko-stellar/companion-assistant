/**
 * Safety escalation tests — independent classification, event persistence,
 * SMS thresholds, idempotency, bounded retry, visible failures, honest
 * messaging, and the labelled test-SMS mechanism.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db before importing the service ──────────────────────────────────
const insertMock = vi.fn();
const updateMock = vi.fn();
const selectMock = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    insert: (...a: unknown[]) => insertMock(...a),
    update: (...a: unknown[]) => updateMock(...a),
    select: (...a: unknown[]) => selectMock(...a),
  },
}));
vi.mock("@workspace/db/schema", () => ({
  safetyEvents: { id: "id", userId: "user_id" },
  emergencyContacts: { userId: "user_id", isPrimary: "is_primary", isActive: "is_active" },
  users: { id: "id" },
}));
vi.mock("../providers/registry", () => ({
  llmProvider: {},
  notificationProvider: {},
}));

import { SafetyService, buildAlertSMS, buildGuidance } from "../domains/safety";
import { MockLLMProvider } from "../providers/impl/mock-llm.provider";
import type { LLMProvider } from "../providers/llm.provider";
import type { NotificationProvider, SendSMSResult } from "../providers/notification.provider";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Rows inserted into safety_events get echoed back with defaults filled. */
function setupDb(opts: {
  contact?: { name: string; phone: string } | null;
}) {
  let eventRow: Record<string, unknown> | null = null;

  insertMock.mockImplementation(() => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        eventRow = {
          id: "evt-1",
          smsSent: false,
          smsAttempts: 0,
          resolved: false,
          ...v,
        };
        return [eventRow];
      },
    }),
  }));

  // Emulates the conditional-update semantics the service relies on:
  //  - attempt claim (sql-increment on smsAttempts) only succeeds while the
  //    row is PENDING, unsent, and under the 2-attempt budget
  //  - marking SENT only succeeds when not already SENT
  //  - PENDING/FAILED writeback only succeeds from SENDING
  updateMock.mockImplementation(() => ({
    set: (v: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          const row = eventRow ?? { id: "evt-1", smsSent: false, smsAttempts: 0 };
          const isClaim = typeof v.smsAttempts === "object" && v.smsAttempts !== null;
          if (isClaim) {
            // Only PENDING rows are claimable (never SENDING — duplicate risk)
            if (
              row.alertStatus !== "PENDING" ||
              row.smsSent === true ||
              (row.smsAttempts as number) >= 2
            ) {
              return [];
            }
            eventRow = {
              ...row,
              ...v,
              smsAttempts: (row.smsAttempts as number) + 1,
            };
            return [eventRow];
          }
          if (v.alertStatus === "SENT" && row.alertStatus === "SENT") return [];
          if (
            (v.alertStatus === "PENDING" || v.alertStatus === "FAILED") &&
            v.smsSent === false &&
            row.alertStatus !== "SENDING" &&
            row.alertStatus !== "PENDING" // initial no-contact FAILED write
          ) {
            return [];
          }
          eventRow = { ...row, ...v };
          return [eventRow];
        },
      }),
    }),
  }));

  selectMock.mockImplementation(() => ({
    from: () => ({
      where: () =>
        Promise.resolve(opts.contact ? [{ ...opts.contact, userId: "u1" }] : []),
    }),
  }));

  return {
    getEvent: () => eventRow,
    seed: (row: Record<string, unknown>) => {
      eventRow = { ...row };
    },
  };
}

function fakeLLM(overrides?: Partial<Awaited<ReturnType<LLMProvider["classifySafety"]>>["safety"]>): LLMProvider {
  return {
    classifySafety: vi.fn(async () => ({
      safety: {
        classification: "fall_with_inability_to_get_up",
        category: "FALL" as const,
        severity: "high" as const,
        confidence: 0.9,
        requiresImmediateAttention: true,
        reasoning: "test",
        ...overrides,
      },
    })),
  } as unknown as LLMProvider;
}

function fakeSMS(results: SendSMSResult[]): { provider: NotificationProvider; calls: () => number } {
  const send = vi.fn(async () => results[Math.min(send.mock.calls.length - 1, results.length - 1)]);
  return {
    provider: { sendSMS: send } as unknown as NotificationProvider,
    calls: () => send.mock.calls.length,
  };
}

const turnInput = {
  userId: "u1",
  conversationId: "c1",
  userText: "Pao sam i ne mogu ustati",
  userName: "Ana",
  timezone: "Europe/Zagreb",
  language: "hr",
};

beforeEach(() => {
  insertMock.mockReset();
  updateMock.mockReset();
  selectMock.mockReset();
});

// ── Mock classifier detection ──────────────────────────────────────────────

describe("MockLLMProvider.classifySafety", () => {
  const llm = new MockLLMProvider();

  const urgent: Array<[string, string]> = [
    ["Pao sam i ne mogu ustati", "FALL"],
    ["I fell and I can't get up", "FALL"],
    ["Boli me jako u prsima", "CHEST_PAIN"],
    ["I have terrible chest pain", "CHEST_PAIN"],
    ["Ne mogu disati", "BREATHING"],
    ["I can't breathe", "BREATHING"],
    ["Ne želim više živjeti", "SELF_HARM"],
    ["I want to end my life", "SELF_HARM"],
    ["Upomoć, krvarim", "OTHER_URGENT"],
  ];

  it.each(urgent)("flags %s as %s", async (text, category) => {
    const { safety } = await llm.classifySafety({ userText: text });
    expect(safety.category).toBe(category);
    expect(safety.severity).toBe("high");
    expect(safety.requiresImmediateAttention).toBe(true);
  });

  it("classifies ordinary and routine-ish text as normal", async () => {
    for (const text of [
      "Kako je danas vrijeme?",
      "I watched television all afternoon",
      "I fell asleep early yesterday", // fell ≠ fall emergency
      "Nisam jutros popila kavu",
    ]) {
      const { safety } = await llm.classifySafety({ userText: text });
      expect(safety.category).toBe("NONE");
      expect(safety.requiresImmediateAttention).toBe(false);
    }
  });
});

// ── Escalation pipeline ────────────────────────────────────────────────────

describe("SafetyService.evaluateConversationTurn", () => {
  it("returns non-urgent without persisting when classification is NONE", async () => {
    setupDb({ contact: null });
    const svc = new SafetyService(
      fakeLLM({ category: "NONE", severity: "low", requiresImmediateAttention: false }),
      fakeSMS([{ success: true }]).provider,
    );
    const outcome = await svc.evaluateConversationTurn(turnInput);
    expect(outcome.urgent).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("persists event and sends exactly one SMS on urgent classification", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const sms = fakeSMS([{ success: true, providerMessageId: "SM123" }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);

    const outcome = await svc.evaluateConversationTurn(turnInput);

    expect(outcome.urgent).toBe(true);
    expect(sms.calls()).toBe(1);
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("SENT");
    expect(evt.smsSent).toBe(true);
    expect(evt.providerMessageId).toBe("SM123");
    expect(evt.source).toBe("CONVERSATION");
    expect(outcome.guidance).toContain("Marko");
  });

  it("does not send SMS below the confidence threshold but still persists", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM({ confidence: 0.4 }), sms.provider);

    const outcome = await svc.evaluateConversationTurn(turnInput);
    expect(outcome.urgent).toBe(true);
    expect(sms.calls()).toBe(0);
    expect(db.getEvent()!.alertStatus).toBe("NONE");
  });

  it("records a visible FAILED status when no active contact exists", async () => {
    const db = setupDb({ contact: null });
    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);

    const outcome = await svc.evaluateConversationTurn(turnInput);
    expect(sms.calls()).toBe(0);
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("FAILED");
    expect(evt.smsSent).toBe(false);
    expect(evt.providerError).toContain("No active emergency contact");
    // Guidance must be honest about the failure
    expect(outcome.guidance).not.toContain("Poslala sam poruku");
  });

  it("retries with a bound and preserves the provider error on failure", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const sms = fakeSMS([{ success: false, error: "Twilio error 400: bad number" }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);

    await svc.evaluateConversationTurn(turnInput);
    expect(sms.calls()).toBe(2); // MAX_SMS_ATTEMPTS
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("FAILED");
    expect(evt.smsSent).toBe(false);
    expect(evt.smsAttempts).toBe(2);
    expect(evt.providerError).toContain("Twilio error 400");
  });

  it("never auto-retries an ambiguous provider outcome (possible duplicate)", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const sms = fakeSMS([
      { success: false, ambiguous: true, error: "Twilio request timed out after 10000ms — delivery status unknown" },
    ]);
    const svc = new SafetyService(fakeLLM(), sms.provider);

    await svc.evaluateConversationTurn(turnInput);
    expect(sms.calls()).toBe(1); // exactly one attempt, no retry
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("FAILED");
    expect(evt.smsSent).toBe(false);
    expect(evt.smsAttempts).toBe(2); // budget closed against later retries
    expect(evt.providerError).toContain("avoid a possible duplicate");
  });

  it("stores bounded evidence, never the full utterance beyond the cap", async () => {
    const db = setupDb({ contact: null });
    const svc = new SafetyService(
      fakeLLM({ requiresImmediateAttention: false, severity: "medium" }),
      fakeSMS([{ success: true }]).provider,
    );
    const long = "Pao sam i ne mogu ustati " + "x".repeat(600);
    await svc.evaluateConversationTurn({ ...turnInput, userText: long });
    expect((db.getEvent()!.triggerText as string).length).toBeLessThanOrEqual(280);
  });
});

describe("SafetyService.sendAlert idempotency", () => {
  it("concurrent callers on the same PENDING event produce exactly one send", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    let sends = 0;
    const slowProvider = {
      sendSMS: async () => {
        sends += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { success: true, providerMessageId: `SM-${sends}` };
      },
    } as unknown as NotificationProvider;
    const svc = new SafetyService(fakeLLM(), slowProvider);

    // Seed a PENDING event into the mocked DB state
    const pending = {
      id: "evt-1",
      alertStatus: "PENDING",
      smsSent: false,
      smsAttempts: 0,
      triggerText: "Pao sam i ne mogu ustati",
    };
    db.seed(pending);
    await Promise.all([
      svc.sendAlert(pending as never, turnInput),
      svc.sendAlert(pending as never, turnInput),
    ]);
    expect(sends).toBe(1);
    expect(db.getEvent()!.alertStatus).toBe("SENT");
  });

  it("refuses to re-send an already SENT event", async () => {
    setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);

    const sent = {
      id: "evt-1",
      alertStatus: "SENT",
      smsSent: true,
      smsAttempts: 1,
      triggerText: "x",
    } as never;
    await svc.sendAlert(sent, turnInput);
    expect(sms.calls()).toBe(0);
  });

  it("refuses when the attempt budget is exhausted", async () => {
    setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);

    const exhausted = {
      id: "evt-1",
      alertStatus: "FAILED",
      smsSent: false,
      smsAttempts: 2,
      triggerText: "x",
    } as never;
    await svc.sendAlert(exhausted, turnInput);
    expect(sms.calls()).toBe(0);
  });
});

// ── Message content ────────────────────────────────────────────────────────

describe("SMS and guidance content", () => {
  it("builds a localized Croatian SMS that never claims emergency services were called", () => {
    const msg = buildAlertSMS({
      userName: "Ana",
      evidence: "Pao sam i ne mogu ustati",
      timezone: "Europe/Zagreb",
      language: "hr",
    });
    expect(msg).toContain("Ana");
    expect(msg).toContain("NISU kontaktirane");
    expect(msg).toMatch(/u \d{2}:\d{2}/);
  });

  it("builds an English SMS with name, time and honest scope", () => {
    const msg = buildAlertSMS({
      userName: "Ana",
      evidence: "I fell and can't get up",
      timezone: "Europe/Zagreb",
      language: "en",
    });
    expect(msg).toContain("Ana");
    expect(msg).toContain("have NOT been contacted");
  });

  it("guidance is calm, non-diagnostic and honest about SMS state", () => {
    const sentG = buildGuidance({ category: "CHEST_PAIN", language: "en", smsState: "SENT", contactName: "Marko" });
    expect(sentG).toContain("Marko");
    expect(sentG).not.toMatch(/heart attack|diagnos/i);

    const failG = buildGuidance({ category: "FALL", language: "en", smsState: "FAILED" });
    expect(failG).toContain("wasn't able to send");

    const simG = buildGuidance({ category: "FALL", language: "en", smsState: "SIMULATED" });
    expect(simG).toContain("NOT sent");
    expect(simG).not.toContain("I've sent a message");
  });
});

// ── Simulated-delivery honesty ─────────────────────────────────────────────

describe("simulated (mock) delivery honesty", () => {
  it("marks the event SIMULATED, not sent, and never claims family was notified", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const svc = new SafetyService(fakeLLM(), {
      sendSMS: async () => ({ success: true, simulated: true, providerMessageId: "mock-1" }),
    } as unknown as NotificationProvider);

    const outcome = await svc.evaluateConversationTurn(turnInput);
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("SIMULATED");
    expect(evt.smsSent).toBe(false);
    expect(outcome.guidance).toContain("NIJE poslana"); // hr: real message NOT sent
    expect(outcome.guidance).not.toContain("Poslala sam poruku");
  });
});

// ── Stale SENDING recovery ─────────────────────────────────────────────────

describe("SafetyService.recoverStaleAlerts", () => {
  it("marks a stale SENDING event with an exhausted budget as FAILED", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const stale = {
      id: "evt-1",
      userId: "u1",
      alertStatus: "SENDING",
      smsSent: false,
      smsAttempts: 2,
      lastAttemptAt: new Date(Date.now() - 10 * 60_000),
      providerError: null,
      triggerText: "x",
    };
    db.seed(stale);
    selectMock.mockImplementation(() => ({
      from: () => ({ where: () => Promise.resolve([stale]) }),
    }));

    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);
    await svc.recoverStaleAlerts();

    expect(sms.calls()).toBe(0);
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("FAILED");
    expect(evt.providerError).toContain("interrupted");
  });

  it("never re-sends a stale SENDING event — marks it FAILED for manual verification", async () => {
    // The original in-flight send may still be completing at the provider;
    // recovery must not risk a duplicate real SMS.
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const stale = {
      id: "evt-1",
      userId: "u1",
      alertStatus: "SENDING",
      smsSent: false,
      smsAttempts: 1, // budget NOT exhausted — still must not re-send
      lastAttemptAt: new Date(Date.now() - 10 * 60_000),
      triggerText: "Pao sam i ne mogu ustati",
    };
    db.seed(stale);
    selectMock.mockImplementation(() => ({
      from: () => ({ where: () => Promise.resolve([stale]) }),
    }));

    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);
    await svc.recoverStaleAlerts();

    expect(sms.calls()).toBe(0);
    const evt = db.getEvent()!;
    expect(evt.alertStatus).toBe("FAILED");
    expect(evt.smsAttempts).toBe(2); // auto-retry budget closed
    expect(evt.providerError).toContain("verify with the contact");
  });

  it("a recovered (FAILED) event can no longer be claimed by sendAlert", async () => {
    const db = setupDb({ contact: { name: "Marko", phone: "+385911234567" } });
    const failed = {
      id: "evt-1",
      alertStatus: "FAILED",
      smsSent: false,
      smsAttempts: 2,
      triggerText: "x",
    };
    db.seed(failed);
    const sms = fakeSMS([{ success: true }]);
    const svc = new SafetyService(fakeLLM(), sms.provider);
    await svc.sendAlert(failed as never, turnInput);
    expect(sms.calls()).toBe(0);
    expect(db.getEvent()!.alertStatus).toBe("FAILED");
  });
});

// ── Test-SMS mechanism ─────────────────────────────────────────────────────

describe("SafetyService.sendTestSMS", () => {
  it("sends a clearly labelled TEST message and creates no event", async () => {
    setupDb({ contact: null });
    const send = vi.fn(async (p: { message: string }) => {
      expect(p.message).toContain("TEST");
      expect(p.message.toLowerCase()).toContain("no action");
      return { success: true, providerMessageId: "SM-test" };
    });
    const svc = new SafetyService(fakeLLM(), { sendSMS: send } as unknown as NotificationProvider);

    const result = await svc.sendTestSMS({ phone: "+385911234567" });
    expect(result.success).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("reports delivery failure honestly", async () => {
    setupDb({ contact: null });
    const svc = new SafetyService(fakeLLM(), {
      sendSMS: async () => ({ success: false, error: "No SMS provider configured" }),
    } as unknown as NotificationProvider);

    const result = await svc.sendTestSMS({ phone: "+385911234567", language: "hr" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No SMS provider");
  });
});
