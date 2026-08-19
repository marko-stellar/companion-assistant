/**
 * SearchProvider — interface for web search and trusted news retrieval.
 *
 * Trusted-news enforcement: the caller (SearchService) derives the
 * `allowedDomains` list from the news_sources table (is_active = true) and
 * passes it in. Providers MUST only return articles whose URL hostname is in
 * that list; SearchService additionally filters results as defense in depth.
 *
 * Providers return bounded metadata only (title, source, date, snippet, URL) —
 * never full page bodies.
 */

export interface SearchWebParams {
  query: string;
  language?: string;
  maxResults?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: Date;
  sourceName?: string;
}

export interface SearchWebResult {
  results: SearchResult[];
}

export interface SearchTrustedNewsParams {
  /** Topics or query terms the user asked about (may be empty for a general digest). */
  topics?: string[];
  language?: string;
  maxResults?: number;
  /**
   * Normalized hostnames (lowercase, no leading "www.") of enabled trusted
   * sources. REQUIRED — derived server-side from the news_sources table.
   * Providers must not return articles from any other domain.
   */
  allowedDomains: string[];
}

export interface SearchTrustedNewsResult {
  articles: SearchResult[];
}

/** Thrown when no search capability/credential is configured. */
export class SearchUnavailableError extends Error {
  constructor(message = "Search is not available: no search provider is configured.") {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

export interface SearchProvider {
  searchWeb(params: SearchWebParams): Promise<SearchWebResult>;
  searchTrustedNews(params: SearchTrustedNewsParams): Promise<SearchTrustedNewsResult>;
}
