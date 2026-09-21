import { describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/ai/llmService";
import { requestJson } from "../src/integrations/httpClient";
import { ExternalServiceError } from "../src/utils/errors";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoiceService } from "../src/voice/voiceService";

describe("external service failures", () => {
  it("LLM service fails closed without leaking credentials on provider outage", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const service = new LlmService({
      apiKey: "sk-test-secret",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(service.complete({ prompt: "hello" })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(service.complete({ prompt: "hello" })).rejects.toThrow(/unavailable/i);

    try {
      await service.complete({ prompt: "hello" });
    } catch (error) {
      expect((error as Error).message).not.toContain("sk-test-secret");
    }
  });

  it("STT service fails closed without leaking credentials on provider outage", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const service = new SttService({
      apiKey: "stt-secret",
      provider: "openai",
      model: "whisper-1",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(service.transcribe({ audio: new Uint8Array([1, 2, 3]) })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(service.transcribe({ audio: new Uint8Array([1, 2, 3]) })).rejects.toThrow(
      /unavailable/i,
    );
  });

  it("TTS service fails closed without leaking credentials", async () => {
    const service = new TtsService("tts-secret", "openai", "tts-1");

    await expect(service.synthesize({ text: "hello" })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  it("browser voice requires STT/TTS config, not telephony credentials", async () => {
    const service = new VoiceService({ sttProvider: undefined, ttsProvider: undefined });

    await expect(service.initializeBrowserSession()).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(service.initializeBrowserSession()).rejects.toThrow(/STT and TTS/i);
  });

  it("HTTP integration maps network failures to a safe error", async () => {
    await expect(requestJson({ url: "http://127.0.0.1:65535/missing" })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });
});
