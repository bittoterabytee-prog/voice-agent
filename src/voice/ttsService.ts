import { getConfig } from "../config";
import { ExternalServiceError, ValidationError } from "../utils/errors";
import {
  isLanguageCode,
  normalizeLanguageCode,
  type LanguageCode,
} from "./languageDetectionService";

export type TtsSynthesizeRequest = {
  text: string;
  voice?: string;
  /**
   * Reply language (en | hi | hinglish). Selects a default OpenAI voice when
   * `voice` is omitted (KAN-26). Explicit `voice` always wins.
   */
  language?: string;
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

/** OpenAI TTS voices used per reply language (one stack — not separate agents). */
export const TTS_VOICE_BY_LANGUAGE: Record<LanguageCode, string> = {
  en: "alloy",
  hi: "nova",
  hinglish: "nova",
};

function toLanguageCode(language?: string | null): LanguageCode {
  const normalized = normalizeLanguageCode(language ?? undefined);
  if (normalized && isLanguageCode(normalized)) {
    return normalized;
  }
  return "en";
}

/**
 * Resolve OpenAI TTS voice for a reply language.
 * Explicit `voiceOverride` wins; otherwise map en→alloy, hi/hinglish→nova.
 */
export function resolveTtsVoice(
  language?: string | null,
  voiceOverride?: string | null,
): string {
  const override = voiceOverride?.trim();
  if (override) {
    return override;
  }
  return TTS_VOICE_BY_LANGUAGE[toLanguageCode(language)] ?? DEFAULT_OPENAI_VOICE;
}

/**
 * Browser-POC text-to-speech adapter (KAN-13 / KAN-26).
 * Uses getConfig().tts only — no telephony providers.
 * One TTS stack for en / hi / hinglish; language selects default voice when unset.
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
    const voice = resolveTtsVoice(request.language, request.voice);

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
