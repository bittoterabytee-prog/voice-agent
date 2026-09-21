import { getConfig } from "../config";
import { ExternalServiceError } from "../utils/errors";

export type BrowserVoiceSession = {
  sessionId: string;
  language: string;
};

export type VoiceServiceOptions = {
  sttProvider?: string;
  ttsProvider?: string;
};

/**
 * Coordinates browser microphone audio with STT/TTS configuration.
 * Replaces telephony-oriented voice provider wiring for the POC.
 */
export class VoiceService {
  private readonly sttProvider?: string;
  private readonly ttsProvider?: string;

  constructor(options: VoiceServiceOptions = {}) {
    const config = getConfig();
    this.sttProvider = "sttProvider" in options ? options.sttProvider : config.stt.provider;
    this.ttsProvider = "ttsProvider" in options ? options.ttsProvider : config.tts.provider;
  }

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
