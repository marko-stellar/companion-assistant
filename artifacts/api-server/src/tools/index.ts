export * from "./types";
export * from "./definitions";
export * from "./executor";

/**
 * Parse a raw LLM response for an embedded <tool_call>…</tool_call> block.
 * Returns the parsed request or null if no tool call is present.
 */
import type { ToolCallRequest } from "./types";

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;

export function parseToolCall(content: string): ToolCallRequest | null {
  const match = TOOL_CALL_RE.exec(content);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]!) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "tool" in parsed &&
      typeof (parsed as Record<string,unknown>).tool === "string" &&
      "args" in parsed &&
      typeof (parsed as Record<string,unknown>).args === "object"
    ) {
      return parsed as ToolCallRequest;
    }
    return null;
  } catch {
    return null;
  }
}
