import { getConfig } from "../config";
import { ExternalServiceError, ValidationError } from "../utils/errors";

export type TtsSynthesizeRequest = {
  text: string;
  voice?: string;
};

export type TtsSynthesizeResponse = {
  audio: Uint8Array;
  mimeType: string;
};

export type TtsFetch = typeof fetch;

export type TtsServiceOptions = {
  /** When the property is present, it overrides config (even if undefined). */
  apiKey?: string;
  provider?: string;
  model?: string;
  fetchImpl?: TtsFetch;
};

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_OPENAI_VOICE = "alloy";
const DEFAULT_OPENAI_MIME = "audio/mpeg";

/**
 * Browser-POC text-to-speech adapter (KAN-13).
 * Uses getConfig().tts only — no telephony providers.
 * Sprint 2: English synthesis; multilingual / adaptive voice profiles are later sprints.
 */
export class TtsService {
  private readonly apiKey?: string;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly fetchImpl: TtsFetch;

  constructor(options: TtsServiceOptions = {}) {
    const config = getConfig();
    this.apiKey = "apiKey" in options ? options.apiKey : config.tts.apiKey;
    this.provider = "provider" in options ? options.provider : config.tts.provider;
    this.model = "model" in options ? options.model : config.tts.model;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async synthesize(request: TtsSynthesizeRequest): Promise<TtsSynthesizeResponse> {
    if (!this.apiKey || !this.provider) {
      throw new ExternalServiceError("tts", "Text-to-speech provider is not configured");
    }

    const text = request.text?.trim() ?? "";
    if (!text) {
      throw new ValidationError("Text to synthesize is empty or invalid");
    }

    const model = this.model?.trim() || "tts-1";
    const voice = request.voice?.trim() || DEFAULT_OPENAI_VOICE;

    if (this.provider.toLowerCase() !== "openai") {
      throw new ExternalServiceError(
        "tts",
        `Text-to-speech provider "${this.provider}" is not supported`,
      );
    }

    return this.synthesizeOpenAi(text, model, voice);
  }

  private async synthesizeOpenAi(
    text: string,
    model: string,
    voice: string,
  ): Promise<TtsSynthesizeResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(OPENAI_SPEECH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          response_format: "mp3",
        }),
      });
    } catch {
      throw new ExternalServiceError("tts", "Text-to-speech provider is unavailable");
    }

    if (!response.ok) {
      throw new ExternalServiceError(
        "tts",
        `Text-to-speech provider failed with status ${response.status}`,
      );
    }

    let buffer: ArrayBuffer;
    try {
      buffer = await response.arrayBuffer();
    } catch {
      throw new ExternalServiceError("tts", "Text-to-speech provider returned an invalid response");
    }

    const audio = new Uint8Array(buffer);
    if (audio.byteLength === 0) {
      throw new ExternalServiceError("tts", "Text-to-speech provider returned empty audio");
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || DEFAULT_OPENAI_MIME;
    return { audio, mimeType };
  }
}

export const ttsService = new TtsService();
