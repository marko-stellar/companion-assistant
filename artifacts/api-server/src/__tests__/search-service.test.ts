/**
 * SearchService tests — trusted-news domain allowlisting, disabled-source
 * exclusion, result bounding/normalization, and honest failure outcomes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing the service
const selectMock = vi.fn();
vi.mock("@workspace/db", () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
  newsSources: { url: "url", isActive: "is_active" },
}));

import { SearchService, normalizeDomain } from "../domains/search";
import {
  SearchUnavailableError,
  type SearchProvider,
  type SearchTrustedNewsParams,
  type SearchWebParams,
} from "../providers/search.provider";
import { UnavailableSearchProvider } from "../providers/impl/unavailable-search.provider";
import { MockSearchProvider } from "../providers/impl/mock-search.provider";

/** Configure the mocked db.select().from().where() chain to resolve rows. */
function dbReturns(rows: { url: string | null }[]) {
  selectMock.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

function makeProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    searchWeb: vi.fn(async (_p: SearchWebParams) => ({ results: [] })),
    searchTrustedNews: vi.fn(async (_p: SearchTrustedNewsParams) => ({ articles: [] })),
    ...overrides,
  };
}

beforeEach(() => {
  selectMock.mockReset();
});

describe("normalizeDomain", () => {
  it("lowercases and strips www + scheme", () => {
    expect(normalizeDomain("https://WWW.BBC.com/news")).toBe("bbc.com");
    expect(normalizeDomain("http://index.hr")).toBe("index.hr");
    expect(normalizeDomain("bbc.co.uk")).toBe("bbc.co.uk");
  });

  it("rejects invalid or non-http URLs", () => {
    expect(normalizeDomain("not a url at all !!")).toBeNull();
    expect(normalizeDomain("ftp://example.com")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });
});

describe("getTrustedNews — allowlist enforcement", () => {
  it("passes only enabled-source domains to the provider", async () => {
    dbReturns([{ url: "https://www.bbc.com" }, { url: "https://index.hr" }]);
    const provider = makeProvider();
    const service = new SearchService(provider);

    await service.getTrustedNews(["weather"]);

    expect(provider.searchTrustedNews).toHaveBeenCalledWith(
      expect.objectContaining({ allowedDomains: ["bbc.com", "index.hr"] }),
    );
  });

  it("filters out provider results from non-allowlisted domains (defense in depth)", async () => {
    dbReturns([{ url: "https://www.bbc.com" }]);
    const provider = makeProvider({
      searchTrustedNews: vi.fn(async () => ({
        articles: [
          { title: "OK article", url: "https://www.bbc.com/news/1", snippet: "fine" },
          { title: "Subdomain OK", url: "https://sport.bbc.com/2", snippet: "fine" },
          { title: "Rogue article", url: "https://evil.example.com/3", snippet: "leaked" },
          { title: "Suffix trick", url: "https://notbbc.com/4", snippet: "leaked" },
        ],
      })),
    });
    const service = new SearchService(provider);

    const outcome = await service.getTrustedNews([]);
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.results.map(r => r.title)).toEqual(["OK article", "Subdomain OK"]);
    }
  });

  it("returns no_sources when every source is disabled or missing a URL", async () => {
    dbReturns([]); // db WHERE isActive=true returns nothing
    const provider = makeProvider();
    const service = new SearchService(provider);

    const outcome = await service.getTrustedNews(["news"]);
    expect(outcome).toEqual({ status: "no_sources", mode: "news" });
    expect(provider.searchTrustedNews).not.toHaveBeenCalled();
  });

  it("skips sources whose URL cannot be normalized", async () => {
    dbReturns([{ url: "%%%not-a-url" }, { url: null }]);
    const service = new SearchService(makeProvider());
    const outcome = await service.getTrustedNews([]);
    expect(outcome).toEqual({ status: "no_sources", mode: "news" });
  });
});

describe("result bounding and normalization", () => {
  it("caps result count, truncates title/snippet, and formats the date", async () => {
    dbReturns([{ url: "https://bbc.com" }]);
    const longTitle = "T".repeat(500);
    const longSnippet = "S".repeat(1000);
    const provider = makeProvider({
      searchTrustedNews: vi.fn(async () => ({
        articles: Array.from({ length: 10 }, (_, i) => ({
          title: longTitle,
          url: `https://bbc.com/${i}`,
          snippet: longSnippet,
          publishedAt: new Date("2026-08-19T10:00:00Z"),
        })),
      })),
    });
    const service = new SearchService(provider);

    const outcome = await service.getTrustedNews([]);
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.results.length).toBeLessThanOrEqual(5);
      expect(outcome.results[0]!.title.length).toBeLessThanOrEqual(150);
      expect(outcome.results[0]!.snippet.length).toBeLessThanOrEqual(300);
      expect(outcome.results[0]!.publishedDate).toBe("2026-08-19");
      expect(outcome.results[0]!.sourceName).toBe("bbc.com");
    }
  });

  it("bounds web search results too", async () => {
    const provider = makeProvider({
      searchWeb: vi.fn(async () => ({
        results: Array.from({ length: 8 }, (_, i) => ({
          title: `r${i}`,
          url: `https://example.org/${i}`,
          snippet: "x",
        })),
      })),
    });
    const service = new SearchService(provider);
    const outcome = await service.searchWeb("anything");
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") expect(outcome.results.length).toBe(5);
  });
});

describe("honest failure outcomes", () => {
  it("maps SearchUnavailableError to 'unavailable' for news and web", async () => {
    dbReturns([{ url: "https://bbc.com" }]);
    const service = new SearchService(new UnavailableSearchProvider());

    expect(await service.getTrustedNews([])).toEqual({ status: "unavailable", mode: "news" });
    expect(await service.searchWeb("q")).toEqual({ status: "unavailable", mode: "web" });
  });

  it("maps empty provider results to 'empty'", async () => {
    dbReturns([{ url: "https://bbc.com" }]);
    const service = new SearchService(makeProvider());
    expect(await service.getTrustedNews([])).toEqual({ status: "empty", mode: "news" });
    expect(await service.searchWeb("q")).toEqual({ status: "empty", mode: "web" });
  });

  it("maps unexpected provider errors to 'error'", async () => {
    dbReturns([{ url: "https://bbc.com" }]);
    const provider = makeProvider({
      searchTrustedNews: vi.fn(async () => { throw new Error("network boom"); }),
      searchWeb: vi.fn(async () => { throw new Error("network boom"); }),
    });
    const service = new SearchService(provider);
    expect(await service.getTrustedNews([])).toEqual({ status: "error", mode: "news" });
    expect(await service.searchWeb("q")).toEqual({ status: "error", mode: "web" });
  });
});

describe("MockSearchProvider", () => {
  it("only fabricates articles from allowedDomains and none when empty", async () => {
    const mock = new MockSearchProvider();
    const withDomains = await mock.searchTrustedNews({ allowedDomains: ["bbc.com"], topics: ["x"] });
    expect(withDomains.articles.every(a => a.url.includes("bbc.com"))).toBe(true);

    const noDomains = await mock.searchTrustedNews({ allowedDomains: [] });
    expect(noDomains.articles).toEqual([]);
  });
});

describe("UnavailableSearchProvider", () => {
  it("throws SearchUnavailableError from both methods", async () => {
    const p = new UnavailableSearchProvider();
    await expect(p.searchWeb({ query: "q" })).rejects.toBeInstanceOf(SearchUnavailableError);
    await expect(p.searchTrustedNews({ allowedDomains: [] })).rejects.toBeInstanceOf(SearchUnavailableError);
  });
});
