/**
 * Search domain — orchestrates web and trusted-news retrieval.
 *
 * All searches go through SearchProvider; never call search APIs directly
 * from React components or route handlers.
 *
 * Trusted-news enforcement happens HERE, server-side:
 *   1. Enabled sources are loaded from the news_sources table (is_active).
 *   2. Their URLs are normalized to hostnames → allowedDomains.
 *   3. The provider is called with that explicit allowlist.
 *   4. Returned articles are re-filtered against the allowlist
 *      (defense in depth — a misbehaving provider cannot leak other domains).
 *
 * All results are bounded and normalized to metadata only:
 * title, source, date, snippet, URL. Never full page bodies.
 */

import { eq } from "drizzle-orm";
import { db, newsSources } from "@workspace/db";
import type { SearchProvider, SearchResult } from "../../providers/search.provider";
import { SearchUnavailableError } from "../../providers/search.provider";

const MAX_RESULTS = 5;
const MAX_TITLE_LEN = 150;
const MAX_SNIPPET_LEN = 300;

/** Normalized, bounded result safe to inject into an LLM prompt. */
export interface BoundedSearchResult {
  title: string;
  sourceName: string;
  url: string;
  snippet: string;
  /** ISO date (YYYY-MM-DD) when known. */
  publishedDate?: string;
}

export type CurrentInfoOutcome =
  | { status: "ok"; mode: "news" | "web"; results: BoundedSearchResult[] }
  | { status: "empty"; mode: "news" | "web" }
  | { status: "no_sources"; mode: "news" }
  | { status: "unavailable"; mode: "news" | "web" }
  | { status: "error"; mode: "news" | "web" };

/**
 * Normalize a source URL to a comparable hostname:
 * lowercase, no leading "www.". Returns null for unparseable URLs.
 */
export function normalizeDomain(rawUrl: string): string | null {
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** True when the result URL's hostname is (a subdomain of) an allowed domain. */
function isAllowed(resultUrl: string, allowedDomains: string[]): boolean {
  const host = normalizeDomain(resultUrl);
  if (!host) return false;
  return allowedDomains.some(d => host === d || host.endsWith(`.${d}`));
}

function bound(r: SearchResult): BoundedSearchResult {
  return {
    title: r.title.slice(0, MAX_TITLE_LEN),
    sourceName: (r.sourceName ?? normalizeDomain(r.url) ?? "unknown source").slice(0, 80),
    url: r.url.slice(0, 500),
    snippet: r.snippet.slice(0, MAX_SNIPPET_LEN),
    publishedDate: r.publishedAt ? r.publishedAt.toISOString().slice(0, 10) : undefined,
  };
}

export class SearchService {
  constructor(private readonly provider: SearchProvider) {}

  /** Hostnames of enabled trusted news sources (normalized, deduplicated). */
  async getEnabledNewsDomains(): Promise<string[]> {
    const rows = await db
      .select({ url: newsSources.url })
      .from(newsSources)
      .where(eq(newsSources.isActive, true));
    const domains = rows
      .map(r => (r.url ? normalizeDomain(r.url) : null))
      .filter((d): d is string => d !== null);
    return [...new Set(domains)];
  }

  /**
   * Retrieve current news restricted to enabled trusted sources.
   * Never throws — every failure mode maps to an honest outcome.
   */
  async getTrustedNews(topics: string[], language = "en"): Promise<CurrentInfoOutcome> {
    let allowedDomains: string[];
    try {
      allowedDomains = await this.getEnabledNewsDomains();
    } catch {
      return { status: "error", mode: "news" };
    }
    if (allowedDomains.length === 0) return { status: "no_sources", mode: "news" };

    try {
      const { articles } = await this.provider.searchTrustedNews({
        topics,
        language,
        maxResults: MAX_RESULTS,
        allowedDomains,
      });
      const filtered = articles
        .filter(a => isAllowed(a.url, allowedDomains))
        .slice(0, MAX_RESULTS)
        .map(bound);
      return filtered.length > 0
        ? { status: "ok", mode: "news", results: filtered }
        : { status: "empty", mode: "news" };
    } catch (err) {
      if (err instanceof SearchUnavailableError) return { status: "unavailable", mode: "news" };
      return { status: "error", mode: "news" };
    }
  }

  /**
   * General web search (bounded metadata only).
   * Never throws — every failure mode maps to an honest outcome.
   */
  async searchWeb(query: string, language = "en"): Promise<CurrentInfoOutcome> {
    try {
      const { results } = await this.provider.searchWeb({
        query,
        language,
        maxResults: MAX_RESULTS,
      });
      const boundedResults = results.slice(0, MAX_RESULTS).map(bound);
      return boundedResults.length > 0
        ? { status: "ok", mode: "web", results: boundedResults }
        : { status: "empty", mode: "web" };
    } catch (err) {
      if (err instanceof SearchUnavailableError) return { status: "unavailable", mode: "web" };
      return { status: "error", mode: "web" };
    }
  }
}

export function createSearchService(provider: SearchProvider): SearchService {
  return new SearchService(provider);
}
