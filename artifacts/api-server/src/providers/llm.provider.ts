/**
 * LLMProvider — interface for all large-language-model operations.
 *
 * Rules:
 * - classifySafety MUST be called as a separate request from respond().
 *   Never combine safety classification with response generation.
 * - No medical diagnosis. The classifier returns concern flags only.
 * - Business logic lives in domain services, not in system prompts passed here.
 */

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRespondParams {
  messages: Message[];
  /** IANA language code for response language */
  language?: string;
  /** Max tokens to generate */
  maxTokens?: number;
}

export interface LLMRespondResult {
  content: string;
  /** Provider-reported token usage for cost tracking */
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ExtractMemoriesParams {
  conversationTranscript: string;
  existingMemorySummary?: string;
}

export interface ExtractedMemory {
  content: string;
  importance: number; // 1–10
  tags: string[];
}

export interface ExtractMemoriesResult {
  memories: ExtractedMemory[];
}

export interface ClassifySafetyParams {
  userText: string;
  recentContext?: string;
}

export interface SafetyClassification {
  classification: string;
  /** 'low' | 'medium' | 'high' */
  severity: "low" | "medium" | "high";
  requiresImmediateAttention: boolean;
  reasoning?: string;
}

export interface ClassifySafetyResult {
  safety: SafetyClassification;
}

export interface AnalyzeImageParams {
  /** Base64-encoded image data or a signed URL */
  imageData: string;
  prompt?: string;
  language?: string;
}

export interface AnalyzeImageResult {
  description: string;
  suggestedQuestion?: string;
}

// ── Tool-aware response ───────────────────────────────────────────────────────

export interface LLMRespondWithToolsParams extends LLMRespondParams {
  /**
   * Tool descriptions injected into the system prompt.
   * The implementation may use native function-calling APIs (e.g. OpenAI tools)
   * or rely on text-based parsing of a <tool_call> block — both are valid.
   */
  toolsSection: string;
}

/** LLM returned plain text (no tool call detected). */
export interface LLMTextResult {
  type: "text";
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/** LLM wants to invoke a named tool with structured arguments. */
export interface LLMToolCallResult {
  type: "tool_call";
  toolName: string;
  args: Record<string, unknown>;
  callId: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export type LLMRespondWithToolsResult = LLMTextResult | LLMToolCallResult;

export interface LLMProvider {
  respond(params: LLMRespondParams): Promise<LLMRespondResult>;
  /**
   * Respond with optional tool-calling support.
   * Returns either a text response or a structured tool call.
   * Implementations that don't support tools should return type: "text".
   */
  respondWithTools(params: LLMRespondWithToolsParams): Promise<LLMRespondWithToolsResult>;
  extractMemories(params: ExtractMemoriesParams): Promise<ExtractMemoriesResult>;
  /** Must be called independently from respond() — never in the same request */
  classifySafety(params: ClassifySafetyParams): Promise<ClassifySafetyResult>;
  analyzeImage(params: AnalyzeImageParams): Promise<AnalyzeImageResult>;
}
