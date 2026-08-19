/**
 * UnavailableSearchProvider — explicit-failure provider used when no search
 * capability or credential is configured. Every call throws
 * SearchUnavailableError so callers can respond honestly instead of
 * silently returning fabricated or empty results.
 */

import {
  SearchUnavailableError,
  type SearchProvider,
  type SearchWebParams,
  type SearchWebResult,
  type SearchTrustedNewsParams,
  type SearchTrustedNewsResult,
} from "../search.provider";

export class UnavailableSearchProvider implements SearchProvider {
  async searchWeb(_params: SearchWebParams): Promise<SearchWebResult> {
    throw new SearchUnavailableError();
  }

  async searchTrustedNews(_params: SearchTrustedNewsParams): Promise<SearchTrustedNewsResult> {
    throw new SearchUnavailableError();
  }
}
