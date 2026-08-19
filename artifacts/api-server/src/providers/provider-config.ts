export type ProviderMode = "real" | "mock";

const MOCK_ALIASES = new Set(["mock", "simulated", "canned", "noop", "no-op"]);

/**
 * Resolve a provider mode with a safe mock default.
 *
 * Invalid values never enable a real integration. Configuration values are
 * never logged because a credential may have been assigned to the wrong key.
 */
export function resolveProviderMode(
  variableName: string,
  rawValue = process.env[variableName],
): ProviderMode {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "real") return "real";
  if (!normalized || MOCK_ALIASES.has(normalized)) return "mock";

  console.warn(`[config] Invalid ${variableName} value — defaulting to mock`);
  return "mock";
}

/** Treat blank configuration values as absent. */
export function readConfig(variableName: string): string | undefined {
  const value = process.env[variableName]?.trim();
  return value ? value : undefined;
}

/** Return only configuration names, never values. */
export function missingConfig(variableNames: string[]): string[] {
  return variableNames.filter((name) => !readConfig(name));
}