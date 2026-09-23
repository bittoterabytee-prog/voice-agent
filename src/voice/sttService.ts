import { getConfig } from "../config";
import { ExternalServiceError, ValidationError } from "../utils/errors";

export type SttTranscribeRequest = {
  audio: ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
  /**
   * Optional session/client language hint (KAN-24).
   * Accepts en | hi | hinglish or ISO-ish tags (en-US, hi-IN).
   * Hinglish omits Whisper `language` so the model can auto-detect mixed speech.
   */
  languageHint?: string;
};

export type SttTranscribeResponse = {
  text: string;
  /** Provider-reported ISO-639-1 language when available (e.g. en, hi). */
  language?: string;
  /**
   * False when the provider reports a language outside the POC set (en / hi).
   * Hinglish is transcript-side (KAN-23); Whisper has no hinglish code.
   */
  supported: boolean;
};

export type SttFetch = typeof fetch;

export type SttServiceOptions = {
  /** When the property is present, it overrides config (even if undefined). */
  apiKey?: string;
  provider?: string;
  model?: string;
  /** Optional default language when the request has no languageHint (KAN-24). */
  defaultLanguage?: string;
  fetchImpl?: SttFetch;
};

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

/** Prompt helps Whisper stay on clinic EN/HI/Hinglish vocabulary when language is auto. */
const MULTILINGUAL_STT_PROMPT =
  "Clinic appointment receptionist. English, Hindi, or Hinglish speech about booking, doctors, and times.";

function toUint8Array(audio: ArrayBuffer | Uint8Array): Uint8Array {
  return audio instanceof Uint8Array ? audio : new Uint8Array(audio);
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "webm";
}

/**
 * Map POC / session language tags to a Whisper ISO-639-1 code.
 * Only English and Hindi are passed to Whisper. Hinglish / unknown / other
 * languages omit `language` so Whisper auto-detects (never force fr/es/…).
 */
export function resolveWhisperLanguage(hint?: string): string | undefined {
  if (!hint) {
    return undefined;
  }
  const normalized = hint.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "hinglish" ||
    normalized === "hi-en" ||
    normalized === "en-hi" ||
    normalized === "auto"
  ) {
    return undefined;
  }

  const primary = normalized.split("-")[0] ?? normalized;
  if (primary === "en" || primary === "english") {
    return "en";
  }
  if (primary === "hi" || primary === "hindi" || primary === "hin") {
    return "hi";
  }

  // Out-of-scope tags (fr, es, …) are ignored — do not bias Whisper.
  return undefined;
}

/** POC-supported Whisper language codes (Hinglish is classified after STT). */
export const SUPPORTED_STT_LANGUAGES = new Set(["en", "hi"]);

/** True when provider language is in the en/hi POC set (or unknown / omitted). */
export function isSupportedSttLanguage(language?: string): boolean {
  if (!language) {
    return true;
  }
  const normalized = normalizeProviderLanguage(language);
  if (!normalized) {
    return true;
  }
  return SUPPORTED_STT_LANGUAGES.has(normalized);
}

/** Normalize Whisper verbose_json language (ISO or English name) to ISO-639-1 when known. */
export function normalizeProviderLanguage(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const raw = value.trim().toLowerCase().replace(/_/g, "-");
  if (!raw) {
    return undefined;
  }
  if (raw === "en" || raw === "english" || raw.startsWith("en-")) {
    return "en";
  }
  if (raw === "hi" || raw === "hindi" || raw === "hin" || raw.startsWith("hi-")) {
    return "hi";
  }
  const primary = raw.split("-")[0] ?? raw;
  if (/^[a-z]{2}$/.test(primary)) {
    return primary;
  }
  // Common Whisper English names for out-of-scope languages
  const nameToIso: Record<string, string> = {
    french: "fr",
    spanish: "es",
    german: "de",
    portuguese: "pt",
    italian: "it",
    arabic: "ar",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    russian: "ru",
    urdu: "ur",
  };
  if (nameToIso[raw]) {
    return nameToIso[raw];
  }
  return raw;
}

/**
 * Browser-POC speech-to-text adapter (KAN-11, KAN-24 multilingual).
 * Uses getConfig().stt only — no telephony providers. One engine for en/hi/hinglish.
 */
export class SttService {
  private readonly apiKey?: string;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly defaultLanguage?: string;
  private readonly fetchImpl: SttFetch;

  constructor(options: SttServiceOptions = {}) {
    const config = getConfig();
    this.apiKey = "apiKey" in options ? options.apiKey : config.stt.apiKey;
    this.provider = "provider" in options ? options.provider : config.stt.provider;
    this.model = "model" in options ? options.model : config.stt.model;
    this.defaultLanguage =
      "defaultLanguage" in options ? options.defaultLanguage : config.stt.defaultLanguage;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async transcribe(request: SttTranscribeRequest): Promise<SttTranscribeResponse> {
    if (!this.apiKey || !this.provider) {
      throw new ExternalServiceError("stt", "Speech-to-text provider is not configured");
    }

    const bytes = toUint8Array(request.audio);
    if (bytes.byteLength === 0) {
      throw new ValidationError("Audio payload is empty or invalid");
    }

    const mimeType = request.mimeType?.trim() || "audio/webm";
    const fileName = request.fileName?.trim() || `audio.${extensionForMime(mimeType)}`;
    const model = this.model?.trim() || "whisper-1";
    const language = resolveWhisperLanguage(request.languageHint ?? this.defaultLanguage);

    if (this.provider.toLowerCase() !== "openai") {
      throw new ExternalServiceError(
        "stt",
        `Speech-to-text provider "${this.provider}" is not supported`,
      );
    }

    return this.transcribeOpenAi(bytes, mimeType, fileName, model, language);
  }

  private async transcribeOpenAi(
    bytes: Uint8Array,
    mimeType: string,
    fileName: string,
    model: string,
    language: string | undefined,
  ): Promise<SttTranscribeResponse> {
    const form = new FormData();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    form.append("file", new Blob([copy], { type: mimeType }), fileName);
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("prompt", MULTILINGUAL_STT_PROMPT);
    if (language) {
      form.append("language", language);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      });
    } catch {
      throw new ExternalServiceError("stt", "Speech-to-text provider is unavailable");
    }

    if (!response.ok) {
      throw new ExternalServiceError(
        "stt",
        `Speech-to-text provider failed with status ${response.status}`,
      );
    }

    let payload: { text?: unknown; language?: unknown };
    try {
      payload = (await response.json()) as { text?: unknown; language?: unknown };
    } catch {
      throw new ExternalServiceError("stt", "Speech-to-text provider returned an invalid response");
    }

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      throw new ExternalServiceError("stt", "Speech-to-text provider returned empty transcript");
    }

    const providerLanguage = normalizeProviderLanguage(
      typeof payload.language === "string" ? payload.language : undefined,
    ) ?? language;

    const supported = isSupportedSttLanguage(providerLanguage);
    return providerLanguage
      ? { text, language: providerLanguage, supported }
      : { text, supported: true };
  }
}

export const sttService = new SttService();
