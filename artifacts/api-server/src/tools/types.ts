/**
 * Companion tool-calling types.
 *
 * Tools give the LLM structured access to backend business services.
 * The LLM proposes arguments; the server validates and executes.
 * The userId is ALWAYS sourced from the authenticated session —
 * it is never present in tool arguments.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the args the LLM must provide */
  parameters: Record<string, unknown>;
}

/** Parsed from the LLM response when it wants to invoke a tool */
export interface ToolCallRequest {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolCallSuccess {
  ok: true;
  /** Short structured data the LLM uses to compose its spoken reply */
  data: Record<string, unknown>;
  /** Hint sentence(s) the LLM can turn into natural speech */
  confirmationHint: string;
}

export interface ToolCallError {
  ok: false;
  /** The LLM should turn this into a polite spoken explanation or clarification question */
  error: string;
}

export type ToolCallResult = ToolCallSuccess | ToolCallError;

/** Full record written to audit_logs for every tool invocation */
export interface ToolAuditEntry {
  tool: string;
  userId: string;
  argsRedacted: Record<string, unknown>;
  outcome: "success" | "validation_error" | "execution_error";
  entityType?: string;
  entityId?: string;
  error?: string;
}
