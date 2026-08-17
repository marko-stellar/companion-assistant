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

export interface LLMProvider {
  respond(params: LLMRespondParams): Promise<LLMRespondResult>;
  extractMemories(params: ExtractMemoriesParams): Promise<ExtractMemoriesResult>;
  /** Must be called independently from respond() — never in the same request */
  classifySafety(params: ClassifySafetyParams): Promise<ClassifySafetyResult>;
  analyzeImage(params: AnalyzeImageParams): Promise<AnalyzeImageResult>;
}
