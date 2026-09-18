import { ExternalServiceError } from "../utils/errors";

export type VoiceEvent = {
  callId: string;
  event: string;
  payload: Record<string, unknown>;
};

export class VoiceService {
  constructor(
    private readonly apiKey?: string,
    private readonly baseUrl?: string,
  ) {}

  async sendEvent(event: VoiceEvent): Promise<void> {
    if (!this.apiKey || !this.baseUrl) {
      throw new ExternalServiceError("voice", "Voice provider is not configured");
    }

    void event;
    throw new ExternalServiceError("voice", "Voice provider is unavailable");
  }
}
