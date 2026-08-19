import type {
  AnalyzeImageParams,
  AnalyzeImageResult,
} from "./llm.provider";

export interface VisionProvider {
  /** Mock/unavailable providers do not need photo bytes or storage access. */
  readonly requiresImageData: boolean;
  analyzeImage(params: AnalyzeImageParams): Promise<AnalyzeImageResult>;
}