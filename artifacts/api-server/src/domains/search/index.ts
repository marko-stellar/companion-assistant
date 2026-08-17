/**
 * Search domain — orchestrates web and news retrieval.
 * All searches go through SearchProvider; never call search APIs directly
 * from React components or route handlers.
 *
 * News results are restricted to sources in the news_sources table
 * (is_active = true, trust_score >= threshold).
 */

import type { SearchProvider, SearchResult } from "../../providers/search.provider";

export class SearchService {
  constructor(private readonly provider: SearchProvider) {}

  async searchWeb(query: string, language = "en"): Promise<SearchResult[]> {
    const result = await this.provider.searchWeb({
      query,
      language,
      maxResults: 5,
    });
    return result.results;
  }

  async getNewsDigest(
    topics: string[],
    language = "en",
  ): Promise<SearchResult[]> {
    const result = await this.provider.searchTrustedNews({
      topics,
      language,
      maxResults: 10,
      minTrustScore: 6,
    });
    return result.articles;
  }
}

// SearchService is instantiated with a concrete provider at startup.
// Export a factory; do not import provider implementations here.
export function createSearchService(provider: SearchProvider): SearchService {
  return new SearchService(provider);
}
