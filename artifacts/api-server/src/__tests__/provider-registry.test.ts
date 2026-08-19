import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function setAllModes(mode: string): void {
  vi.stubEnv("SPEECH_MODE", mode);
  vi.stubEnv("LLM_MODE", mode);
  vi.stubEnv("SEARCH_MODE", mode);
  vi.stubEnv("SMS_MODE", mode);
  vi.stubEnv("VISION_MODE", mode);
  vi.stubEnv("WAKE_WORD_MODE", mode);
}

describe("provider registry modes", () => {
  it("runs every mock provider with invalid real credentials and no network calls", async () => {
    setAllModes("mock");
    vi.stubEnv("ELEVENLABS_API_KEY", "invalid");
    vi.stubEnv("OPENAI_API_KEY", "invalid");
    vi.stubEnv("SEARCH_API_KEY", "invalid");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "invalid");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "invalid");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "invalid");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const registry = await import("../providers/registry");

    const transcript = await registry.speechProvider.transcribe({
      audioBuffer: Buffer.from("not-real-audio"),
      mimeType: "audio/webm",
      language: "hr",
    });
    const safety = await registry.llmProvider.classifySafety({
      userText: "Dobar dan",
    });
    const search = await registry.searchProvider.searchWeb({
      query: "test",
    });
    const sms = await registry.notificationProvider.sendSMS({
      to: "+385911111111",
      message: "test",
      safetyEventId: "event-test",
    });
    const vision = await registry.visionProvider.analyzeImage({
      imageData: "invalid-image-data",
    });
    const stopWakeWord = registry.wakeWordProvider.start(() => {});
    stopWakeWord();

    expect(registry.speechProvider.constructor.name).toBe("MockSpeechProvider");
    expect(registry.llmProvider.constructor.name).toBe("MockLLMProvider");
    expect(registry.searchProvider.constructor.name).toBe("MockSearchProvider");
    expect(registry.notificationProvider.constructor.name).toBe("MockSMSProvider");
    expect(registry.visionProvider.constructor.name).toBe("MockVisionProvider");
    expect(registry.wakeWordProvider.constructor.name).toBe("NoOpWakeWordProvider");
    expect(transcript.transcript).toBeTruthy();
    expect(safety.safety.category).toBe("NONE");
    expect(search.results[0]?.title).toContain("[Mock result");
    expect(sms.simulated).toBe(true);
    expect(vision.description).toContain("Mock vision result");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("selects ElevenLabs only for explicit real speech mode with a key", async () => {
    setAllModes("mock");
    vi.stubEnv("SPEECH_MODE", "real");
    vi.stubEnv("ELEVENLABS_API_KEY", "configured-key");

    const registry = await import("../providers/registry");

    expect(registry.speechProvider.constructor.name).toBe(
      "ElevenLabsSpeechProvider",
    );
  });

  it("uses an unavailable speech provider when real mode lacks its key", async () => {
    setAllModes("mock");
    vi.stubEnv("SPEECH_MODE", "real");
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const registry = await import("../providers/registry");

    expect(registry.speechProvider.constructor.name).toBe(
      "UnavailableSpeechProvider",
    );
    await expect(
      registry.speechProvider.transcribe({
        audioBuffer: Buffer.alloc(0),
        mimeType: "audio/webm",
      }),
    ).rejects.toThrow("SPEECH_MODE=real");
  });

  it("never substitutes mocks for unsupported real integrations", async () => {
    setAllModes("real");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "");

    const registry = await import("../providers/registry");

    expect(registry.llmProvider.constructor.name).toBe(
      "UnavailableLLMProvider",
    );
    expect(registry.searchProvider.constructor.name).toBe(
      "UnavailableSearchProvider",
    );
    expect(registry.notificationProvider.constructor.name).toBe(
      "UnavailableSMSProvider",
    );
    expect(registry.visionProvider.constructor.name).toBe(
      "UnavailableVisionProvider",
    );
    expect(registry.wakeWordProvider.constructor.name).toBe(
      "UnavailableWakeWordProvider",
    );
  });

  it("never logs free-form provider configuration values", async () => {
    setAllModes("real");
    const tokenLikeValue = "secret-token-that-must-not-be-logged";
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "");
    vi.stubEnv("LLM_PROVIDER", tokenLikeValue);
    vi.stubEnv("SEARCH_PROVIDER", tokenLikeValue);
    vi.stubEnv("VISION_PROVIDER", tokenLikeValue);
    vi.stubEnv("WAKE_WORD_PROVIDER", tokenLikeValue);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../providers/registry");

    const output = JSON.stringify([
      ...log.mock.calls,
      ...info.mock.calls,
      ...warn.mock.calls,
      ...error.mock.calls,
    ]);
    expect(output).not.toContain(tokenLikeValue);
  });
});

describe("embedding provider modes", () => {
  it("uses keyword fallback without network calls in mock mode", async () => {
    vi.stubEnv("EMBEDDING_MODE", "mock");
    vi.stubEnv("OPENAI_API_KEY", "invalid");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { embeddingProvider } = await import(
      "../providers/embedding.provider"
    );

    await expect(embeddingProvider.embed("private memory")).resolves.toBeNull();
    expect(embeddingProvider.constructor.name).toBe("NoOpEmbeddingProvider");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails explicitly when real embedding mode lacks its key", async () => {
    vi.stubEnv("EMBEDDING_MODE", "real");
    vi.stubEnv("OPENAI_API_KEY", "");

    const { embeddingProvider } = await import(
      "../providers/embedding.provider"
    );

    expect(embeddingProvider.constructor.name).toBe(
      "UnavailableEmbeddingProvider",
    );
    await expect(embeddingProvider.embed("private memory")).rejects.toThrow(
      "EMBEDDING_MODE=real",
    );
  });

  it("does not fall back silently when the real embedding API rejects a key", async () => {
    vi.stubEnv("EMBEDDING_MODE", "real");
    vi.stubEnv("OPENAI_API_KEY", "invalid");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );

    const { embeddingProvider } = await import(
      "../providers/embedding.provider"
    );

    expect(embeddingProvider.constructor.name).toBe(
      "OpenAIEmbeddingProvider",
    );
    await expect(embeddingProvider.embed("private memory")).rejects.toThrow(
      "OpenAI embeddings request failed (401)",
    );
  });
});