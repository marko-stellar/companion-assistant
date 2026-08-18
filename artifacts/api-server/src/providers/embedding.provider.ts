/**
 * EmbeddingProvider — abstraction over embedding API calls.
 *
 * Two implementations:
 *   OpenAIEmbeddingProvider — uses text-embedding-3-small when OPENAI_API_KEY is set.
 *   NoOpEmbeddingProvider   — returns null; retrieval falls back to keyword heuristics.
 *
 * This abstraction keeps the memory system swappable without touching service code.
 */

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

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[] | null> {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.slice(0, 8192), // model token limit
        }),
      });

      if (!res.ok) return null;
      const data = (await res.json()) as {
        data: { embedding: number[] }[];
      };
      return data.data[0]?.embedding ?? null;
    } catch {
      return null;
    }
  }
}

// ── No-op fallback ────────────────────────────────────────────────────────────

class NoOpEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;

  async embed(_text: string): Promise<number[] | null> {
    return null;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

function buildEmbeddingProvider(): EmbeddingProvider {
  if (process.env.OPENAI_API_KEY) {
    console.log("[embedding] Using OpenAIEmbeddingProvider (text-embedding-3-small)");
    return new OpenAIEmbeddingProvider(process.env.OPENAI_API_KEY);
  }
  console.log("[embedding] No OPENAI_API_KEY — using NoOpEmbeddingProvider (keyword fallback)");
  return new NoOpEmbeddingProvider();
}

export const embeddingProvider = buildEmbeddingProvider();
