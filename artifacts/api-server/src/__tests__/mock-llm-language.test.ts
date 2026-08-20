import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "../providers/impl/mock-llm.provider";

const ANA_SYSTEM_PROMPT = "You are Ana, a caring digital companion.";

describe("MockLLMProvider language selection", () => {
  it("uses Croatian canned replies for Croatian language variants", async () => {
    const provider = new MockLLMProvider();

    const result = await provider.respondWithTools({
      language: "hrv",
      toolsSection: "",
      messages: [
        { role: "system", content: ANA_SYSTEM_PROMPT },
        { role: "user", content: "Dobar dan" },
      ],
    });

    expect(result).toEqual({
      type: "text",
      content:
        "Drago mi je što ste se javili. Uvijek mi je lijepo razgovarati s vama. Kako se osjećate danas?",
    });
  });

  it("keeps simulated tool confirmations in Croatian", async () => {
    const provider = new MockLLMProvider();

    const result = await provider.respond({
      language: "hr",
      messages: [
        { role: "system", content: ANA_SYSTEM_PROMPT },
        {
          role: "assistant",
          content:
            '[Tool create_reminder succeeded. Confirm naturally: "Reminder created for 09:00."]',
        },
      ],
    });

    expect(result.content).toBe("U redu, podsjetnik je spremljen.");
  });
});