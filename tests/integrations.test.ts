import { describe, expect, it } from "vitest";
import { LlmService } from "../src/ai/llmService";
import { requestJson } from "../src/integrations/httpClient";
import { ExternalServiceError } from "../src/utils/errors";
import { VoiceService } from "../src/voice/voiceService";

describe("external service failures", () => {
  it("LLM service fails closed without leaking credentials", async () => {
    const service = new LlmService("sk-test-secret", "https://example.invalid/v1");

    await expect(service.complete({ prompt: "hello" })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(service.complete({ prompt: "hello" })).rejects.toThrow(/unavailable/i);
  });

  it("voice service fails closed without leaking credentials", async () => {
    const service = new VoiceService("voice-secret", "https://example.invalid");

    await expect(
      service.sendEvent({ callId: "call-1", event: "start", payload: {} }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it("HTTP integration maps network failures to a safe error", async () => {
    await expect(requestJson({ url: "http://127.0.0.1:65535/missing" })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });
});
