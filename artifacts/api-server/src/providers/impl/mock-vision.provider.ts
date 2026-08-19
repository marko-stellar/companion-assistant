import type { VisionProvider } from "../vision.provider";
import type {
  AnalyzeImageParams,
  AnalyzeImageResult,
} from "../llm.provider";

/**
 * Deterministic vision stand-in. It never inspects image bytes or calls an
 * external service, and it never identifies a person.
 */
export class MockVisionProvider implements VisionProvider {
  readonly requiresImageData = false;

  async analyzeImage(
    _params: AnalyzeImageParams,
  ): Promise<AnalyzeImageResult> {
    return {
      description:
        "Mock vision result: an uploaded photograph is available, but its contents were not analyzed by an external vision service.",
    };
  }
}