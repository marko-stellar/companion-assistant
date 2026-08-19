import type {
  SpeechProvider,
  SynthesizeParams,
  SynthesizeResult,
  TranscribeParams,
  TranscribeResult,
} from "../speech.provider";

export class UnavailableSpeechProvider implements SpeechProvider {
  constructor(
    private readonly reason =
      "SPEECH_MODE=real requires a configured real speech provider",
  ) {}

  async transcribe(_params: TranscribeParams): Promise<TranscribeResult> {
    throw new Error(this.reason);
  }

  async synthesize(_params: SynthesizeParams): Promise<SynthesizeResult> {
    throw new Error(this.reason);
  }
}