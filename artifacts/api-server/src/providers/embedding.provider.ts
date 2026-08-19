/**
 * EmbeddingProvider — abstraction over embedding API calls.
 *
 * Three implementations:
 *   OpenAIEmbeddingProvider — uses text-embedding-3-small when OPENAI_API_KEY is set.
 *   NoOpEmbeddingProvider   — returns null; retrieval falls back to keyword heuristics.
 *   UnavailableEmbeddingProvider — throws when real mode is misconfigured.
 *
 * This abstraction keeps the memory system swappable without touching service code.
 */
import {
  missingConfig,
  readConfig,
  resolveProviderMode,
} from "./provider-config";

export interface EmbeddingProvider {
  /** Number of dimensions this provider produces. */
  readonly dimensions: number;
  /**
   * Compute an embedding vector for a text string.
   * Returns null when the provider is a no-op or the API call fails.
   */
  embed(text: string): Promise<number[] | null>;
}

// ── OpenAI text-embedding-3-small ────────────────────────────────────────────

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(
    apiKey: string,
    model = readConfig("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small",
  ) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async embed(text: string): Promise<number[] | null> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: text.slice(0, 8192), // model token limit
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI embeddings request failed (${res.status})`);
    }
    const data = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || embedding.length !== this.dimensions) {
      throw new Error("OpenAI embeddings response was invalid");
    }
    return embedding;
  }
}

// ── No-op fallback ────────────────────────────────────────────────────────────

export class NoOpEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;

  async embed(_text: string): Promise<number[] | null> {
    return null;
  }
}

export class UnavailableEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;

  constructor(
    private readonly reason =
      "EMBEDDING_MODE=real requires a configured real embedding provider",
  ) {}

  async embed(_text: string): Promise<number[] | null> {
    throw new Error(this.reason);
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

export function buildEmbeddingProvider(): EmbeddingProvider {
  if (resolveProviderMode("EMBEDDING_MODE") === "mock") {
    console.warn("[embedding] Using NoOpEmbeddingProvider (EMBEDDING_MODE=mock — keyword fallback)");
    return new NoOpEmbeddingProvider();
  }

  const missing = missingConfig(["OPENAI_API_KEY"]);
  if (missing.length > 0) {
    console.error(
      `[embedding] EMBEDDING_MODE=real but required configuration is missing: ${missing.join(", ")}`,
    );
    return new UnavailableEmbeddingProvider(
      `EMBEDDING_MODE=real requires ${missing.join(", ")}`,
    );
  }

  console.info(
    `[embedding] Using OpenAIEmbeddingProvider (EMBEDDING_MODE=real, model=${readConfig("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small"})`,
  );
  return new OpenAIEmbeddingProvider(readConfig("OPENAI_API_KEY")!);
}

export const embeddingProvider = buildEmbeddingProvider();
