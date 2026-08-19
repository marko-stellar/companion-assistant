import type { VisionProvider } from "../vision.provider";
import type {
  AnalyzeImageParams,
  AnalyzeImageResult,
} from "../llm.provider";

export class UnavailableVisionProvider implements VisionProvider {
  readonly requiresImageData = false;

  constructor(
    private readonly reason =
      "VISION_MODE=real is selected, but no supported real vision provider is configured",
  ) {}

  async analyzeImage(_params: AnalyzeImageParams): Promise<AnalyzeImageResult> {
    throw new Error(this.reason);
  }
}