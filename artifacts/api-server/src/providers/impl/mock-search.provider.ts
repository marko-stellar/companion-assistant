/**
 * MockSearchProvider — deterministic development stand-in for a real search
 * API. Used so the full retrieval pipeline (allowlisting, bounding, prompt
 * injection, honest failures) can be exercised without a search credential.
 *
 * Behaviour:
 *  - searchTrustedNews fabricates plausible article METADATA only, strictly
 *    from the allowedDomains it is given. Empty allowedDomains → no articles.
 *  - searchWeb returns generic mock results for the query.
 *  - Content is clearly labelled as mock so it can never be mistaken for
 *    real news in manual testing.
 */

import type {
  SearchProvider,
  SearchResult,
  SearchWebParams,
  SearchWebResult,
  SearchTrustedNewsParams,
  SearchTrustedNewsResult,
} from "../search.provider";

export class MockSearchProvider implements SearchProvider {
  async searchWeb(params: SearchWebParams): Promise<SearchWebResult> {
    const max = Math.min(params.maxResults ?? 3, 5);
    const results: SearchResult[] = Array.from({ length: max }, (_, i) => ({
      title: `[Mock result ${i + 1}] About "${params.query}"`,
      url: `https://example.org/mock/${encodeURIComponent(params.query)}/${i + 1}`,
      snippet: `This is a mock search snippet ${i + 1} about "${params.query}". Replace MockSearchProvider with a real provider for live results.`,
      sourceName: "example.org",
      publishedAt: new Date(),
    }));
    return { results };
  }

  async searchTrustedNews(params: SearchTrustedNewsParams): Promise<SearchTrustedNewsResult> {
    const { allowedDomains, topics, maxResults = 5 } = params;
    if (allowedDomains.length === 0) return { articles: [] };

    const topic = topics?.length ? topics.join(", ") : "today's top stories";
    const articles: SearchResult[] = allowedDomains
      .slice(0, Math.min(maxResults, 5))
      .map((domain, i) => ({
        title: `[Mock headline ${i + 1}] ${topic} — reported by ${domain}`,
        url: `https://${domain}/mock-article-${i + 1}`,
        snippet: `Mock news snippet ${i + 1} about ${topic}. This placeholder comes from the trusted source ${domain}.`,
        sourceName: domain,
        publishedAt: new Date(),
      }));
    return { articles };
  }
}
