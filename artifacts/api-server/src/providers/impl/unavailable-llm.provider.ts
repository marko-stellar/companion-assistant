import type {
  AnalyzeImageParams,
  AnalyzeImageResult,
  ClassifySafetyParams,
  ClassifySafetyResult,
  ExtractMemoriesParams,
  ExtractMemoriesResult,
  LLMProvider,
  LLMRespondParams,
  LLMRespondResult,
  LLMRespondWithToolsParams,
  LLMRespondWithToolsResult,
} from "../llm.provider";

export class UnavailableLLMProvider implements LLMProvider {
  constructor(
    private readonly reason =
      "LLM_MODE=real is selected, but no supported real LLM provider is configured",
  ) {}

  private unavailable(): Error {
    return new Error(this.reason);
  }

  async respond(_params: LLMRespondParams): Promise<LLMRespondResult> {
    throw this.unavailable();
  }

  async respondWithTools(
    _params: LLMRespondWithToolsParams,
  ): Promise<LLMRespondWithToolsResult> {
    throw this.unavailable();
  }

  async extractMemories(
    _params: ExtractMemoriesParams,
  ): Promise<ExtractMemoriesResult> {
    throw this.unavailable();
  }

  async classifySafety(
    _params: ClassifySafetyParams,
  ): Promise<ClassifySafetyResult> {
    throw this.unavailable();
  }

  async analyzeImage(_params: AnalyzeImageParams): Promise<AnalyzeImageResult> {
    throw this.unavailable();
  }
}