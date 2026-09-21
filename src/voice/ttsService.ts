import { getConfig } from "../config";
import { ExternalServiceError } from "../utils/errors";

export type TtsSynthesizeRequest = {
  text: string;
  voice?: string;
};

export type TtsSynthesizeResponse = {
  audio: Uint8Array;
  mimeType: string;
};

/**
 * Browser-POC text-to-speech adapter.
 * No telephone/voice-provider credentials are required for the POC.
 */
export class TtsService {
  constructor(
    private readonly apiKey = getConfig().tts.apiKey,
    private readonly provider = getConfig().tts.provider,
    private readonly model = getConfig().tts.model,
  ) {}

  async synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResponse> {
    if (!this.apiKey || !this.provider) {
      throw new ExternalServiceError("tts", "Text-to-speech provider is not configured");
    }

    void request;
    void this.model;
    throw new ExternalServiceError("tts", "Text-to-speech provider is unavailable");
  }
}

export const ttsService = new TtsService();
