import { getConfig } from "../config";
import { ExternalServiceError, ValidationError } from "../utils/errors";

export type SttTranscribeRequest = {
  audio: ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
};

export type SttTranscribeResponse = {
  text: string;
};

export type SttFetch = typeof fetch;

export type SttServiceOptions = {
  /** When the property is present, it overrides config (even if undefined). */
  apiKey?: string;
  provider?: string;
  model?: string;
  fetchImpl?: SttFetch;
};

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

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
 * Browser-POC speech-to-text adapter (KAN-11).
 * Uses getConfig().stt only — no telephony providers.
 */
export class SttService {
  private readonly apiKey?: string;
  private readonly provider?: string;
  private readonly model?: string;
  private readonly fetchImpl: SttFetch;

  constructor(options: SttServiceOptions = {}) {
    const config = getConfig();
    this.apiKey = "apiKey" in options ? options.apiKey : config.stt.apiKey;
    this.provider = "provider" in options ? options.provider : config.stt.provider;
    this.model = "model" in options ? options.model : config.stt.model;
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

    if (this.provider.toLowerCase() !== "openai") {
      throw new ExternalServiceError(
        "stt",
        `Speech-to-text provider "${this.provider}" is not supported`,
      );
    }

    return this.transcribeOpenAi(bytes, mimeType, fileName, model);
  }

  private async transcribeOpenAi(
    bytes: Uint8Array,
    mimeType: string,
    fileName: string,
    model: string,
  ): Promise<SttTranscribeResponse> {
    const form = new FormData();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    form.append("file", new Blob([copy], { type: mimeType }), fileName);
    form.append("model", model);

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

    let payload: { text?: unknown };
    try {
      payload = (await response.json()) as { text?: unknown };
    } catch {
      throw new ExternalServiceError("stt", "Speech-to-text provider returned an invalid response");
    }

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      throw new ExternalServiceError("stt", "Speech-to-text provider returned empty transcript");
    }

    return { text };
  }
}

export const sttService = new SttService();
