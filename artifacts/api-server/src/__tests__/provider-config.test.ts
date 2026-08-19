import { afterEach, describe, expect, it, vi } from "vitest";
import {
  missingConfig,
  readConfig,
  resolveProviderMode,
} from "../providers/provider-config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("provider configuration helpers", () => {
  it("defaults missing and blank modes to mock", () => {
    expect(resolveProviderMode("TEST_MODE", undefined)).toBe("mock");
    expect(resolveProviderMode("TEST_MODE", "  ")).toBe("mock");
  });

  it.each(["mock", "simulated", "canned", "noop", "no-op"])(
    "accepts %s as mock mode",
    (value) => {
      expect(resolveProviderMode("TEST_MODE", value)).toBe("mock");
    },
  );

  it("selects real mode only for the explicit real value", () => {
    expect(resolveProviderMode("TEST_MODE", " REAL ")).toBe("real");
  });

  it("falls back safely for an invalid mode without logging its value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tokenLikeValue = "sk-should-never-appear-in-logs";

    expect(resolveProviderMode("TEST_MODE", tokenLikeValue)).toBe("mock");
    expect(warn).toHaveBeenCalledWith(
      "[config] Invalid TEST_MODE value — defaulting to mock",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(tokenLikeValue);
  });

  it("treats empty configuration as missing", () => {
    vi.stubEnv("PRESENT_CONFIG", " value ");
    vi.stubEnv("EMPTY_CONFIG", "  ");

    expect(readConfig("PRESENT_CONFIG")).toBe("value");
    expect(readConfig("EMPTY_CONFIG")).toBeUndefined();
    expect(
      missingConfig(["PRESENT_CONFIG", "EMPTY_CONFIG", "ABSENT_CONFIG"]),
    ).toEqual(["EMPTY_CONFIG", "ABSENT_CONFIG"]);
  });
});