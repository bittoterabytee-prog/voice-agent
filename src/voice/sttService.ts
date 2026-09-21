import { getConfig } from "../config";
import { ExternalServiceError } from "../utils/errors";

export type SttTranscribeRequest = {
  audio: ArrayBuffer | Uint8Array;
  mimeType?: string;
};

export type SttTranscribeResponse = {
  text: string;
};

/**
 * Browser-POC speech-to-text adapter.
 * Telephony / phone-number providers are intentionally not used.
 */
export class SttService {
  constructor(
    private readonly apiKey = getConfig().stt.apiKey,
    private readonly provider = getConfig().stt.provider,
    private readonly model = getConfig().stt.model,
  ) {}

  async transcribe(request: SttTranscribeRequest): Promise<SttTranscribeResponse> {
    if (!this.apiKey || !this.provider) {
      throw new ExternalServiceError("stt", "Speech-to-text provider is not configured");
    }

    void request;
    void this.model;
    throw new ExternalServiceError("stt", "Speech-to-text provider is unavailable");
  }
}

export const sttService = new SttService();
