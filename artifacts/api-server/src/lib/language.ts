/**
 * Normalize language identifiers from user settings and provider metadata to
 * the two languages COMPANION currently supports.
 */
export type CompanionLanguage = "en" | "hr";

export function normalizeCompanionLanguage(
  language: string | null | undefined,
): CompanionLanguage {
  const normalized = language?.trim().toLowerCase() ?? "";

  if (
    normalized === "hr" ||
    normalized === "hrv" ||
    normalized.startsWith("hr-") ||
    normalized.startsWith("hr_")
  ) {
    return "hr";
  }

  return "en";
}