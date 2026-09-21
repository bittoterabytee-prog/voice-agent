import { getConfig } from "../config";
import { ExternalServiceError } from "../utils/errors";

export type BrowserVoiceSession = {
  sessionId: string;
  language: string;
};

/**
 * Coordinates browser microphone audio with STT/TTS configuration.
 * Replaces telephony-oriented voice provider wiring for the POC.
 */
export class VoiceService {
  constructor(
    private readonly sttProvider = getConfig().stt.provider,
    private readonly ttsProvider = getConfig().tts.provider,
  ) {}

  async initializeBrowserSession(language = "en"): Promise<BrowserVoiceSession> {
    if (!this.sttProvider || !this.ttsProvider) {
      throw new ExternalServiceError(
        "voice",
        "Browser voice requires STT and TTS configuration (no telephony provider needed)",
      );
    }

    return {
      sessionId: `browser-${Date.now()}`,
      language,
    };
  }
}

export const voiceService = new VoiceService();
