/**
 * SearchProvider — interface for web search and trusted news retrieval.
 * The implementation restricts news results to sources in the
 * news_sources table (trust_score ≥ threshold).
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
  topics?: string[];
  language?: string;
  maxResults?: number;
  /** Minimum trust_score from news_sources; default 5 */
  minTrustScore?: number;
}

export interface SearchTrustedNewsResult {
  articles: SearchResult[];
}

export interface SearchProvider {
  searchWeb(params: SearchWebParams): Promise<SearchWebResult>;
  searchTrustedNews(params: SearchTrustedNewsParams): Promise<SearchTrustedNewsResult>;
}
