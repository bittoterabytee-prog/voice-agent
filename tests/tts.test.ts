import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { ExternalServiceError, ValidationError } from "../src/utils/errors";
import { TtsService } from "../src/voice/ttsService";
import { resetConfigCache } from "../src/config";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
});

describe("KAN-13 text-to-speech", () => {
  it("TC-001 returns audio bytes and mime type when provider succeeds", async () => {
    const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const fetchMock = vi.fn(
      async () =>
        new Response(audioBytes, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
    );

    const service = new TtsService({
      apiKey: "sk-test",
      provider: "openai",
      model: "tts-1",
      fetchImpl: fetchMock as typeof fetch,
    });
    const result = await service.synthesize({ text: "Hello, how can I help?" });

    expect(result.mimeType).toBe("audio/mpeg");
    expect(Array.from(result.audio)).toEqual(Array.from(audioBytes));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
    const body = JSON.parse(String((init as RequestInit).body)) as {
      input: string;
      voice: string;
      model: string;
    };
    expect(body.input).toBe("Hello, how can I help?");
    expect(body.voice).toBe("alloy");
    expect(body.model).toBe("tts-1");
  });

  it("TC-002 fails closed when TTS is not configured", async () => {
    const service = new TtsService({ apiKey: undefined, provider: undefined });
    await expect(service.synthesize({ text: "hello" })).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(service.synthesize({ text: "hello" })).rejects.toThrow(/not configured/i);
  });

  it("TC-003 maps provider failures without leaking secrets", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "boom sk-secret-should-not-leak" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const service = new TtsService({
      apiKey: "sk-secret-should-not-leak",
      provider: "openai",
      model: "tts-1",
      fetchImpl: fetchMock as typeof fetch,
    });
    await expect(service.synthesize({ text: "hello" })).rejects.toBeInstanceOf(ExternalServiceError);

    try {
      await service.synthesize({ text: "hello" });
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect((error as Error).message).not.toContain("sk-secret-should-not-leak");
      expect((error as Error).message).toMatch(/status 500/i);
    }
  });

  it("TC-004 rejects empty text", async () => {
    const service = new TtsService({
      apiKey: "sk-test",
      provider: "openai",
      model: "tts-1",
    });
    await expect(service.synthesize({ text: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("POST /api/tts/synthesize returns audioBase64 for valid text", async () => {
    const audioBytes = Buffer.from([1, 2, 3, 4]);
    const fetchMock = vi.fn(
      async () =>
        new Response(audioBytes, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    process.env.APP_ENV = "test";
    process.env.TTS_PROVIDER = "openai";
    process.env.TTS_API_KEY = "sk-http-test";
    process.env.TTS_MODEL = "tts-1";
    resetConfigCache();

    const app = createApp();
    const response = await request(app)
      .post("/api/tts/synthesize")
      .send({ text: "Your appointment is confirmed." });

    expect(response.status).toBe(200);
    expect(response.body.mimeType).toBe("audio/mpeg");
    expect(response.body.audioBase64).toBe(audioBytes.toString("base64"));
  });

  it("POST /api/tts/synthesize validates missing text", async () => {
    process.env.APP_ENV = "test";
    process.env.TTS_PROVIDER = "openai";
    process.env.TTS_API_KEY = "sk-http-test";
    resetConfigCache();

    const app = createApp();
    const response = await request(app).post("/api/tts/synthesize").send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/sk-http-test/);
  });
});
