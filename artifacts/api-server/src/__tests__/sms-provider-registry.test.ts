import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("SMS provider configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadNotificationProvider() {
    const registry = await import("../providers/registry");
    return registry.notificationProvider;
  }

  it("defaults to simulated delivery even when Twilio credentials exist", async () => {
    vi.stubEnv("SMS_MODE", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token-test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550123");

    const provider = await loadNotificationProvider();

    expect(provider.constructor.name).toBe("MockSMSProvider");
  });

  it("uses simulated delivery when SMS_MODE=mock", async () => {
    vi.stubEnv("SMS_MODE", "mock");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token-test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550123");

    const provider = await loadNotificationProvider();

    expect(provider.constructor.name).toBe("MockSMSProvider");
  });

  it("uses Twilio only when SMS_MODE=real and all credentials exist", async () => {
    vi.stubEnv("SMS_MODE", "real");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token-test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550123");

    const provider = await loadNotificationProvider();

    expect(provider.constructor.name).toBe("TwilioSMSProvider");
  });

  it("fails explicitly instead of simulating when real mode lacks credentials", async () => {
    vi.stubEnv("SMS_MODE", "real");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550123");

    const provider = await loadNotificationProvider();

    expect(provider.constructor.name).toBe("UnavailableSMSProvider");
  });

  it("accepts simulated as an alias for mock", async () => {
    vi.stubEnv("SMS_MODE", "simulated");

    const provider = await loadNotificationProvider();

    expect(provider.constructor.name).toBe("MockSMSProvider");
  });
});