import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { ExternalServiceError, ValidationError } from "../src/utils/errors";
import { SttService } from "../src/voice/sttService";
import { resetConfigCache } from "../src/config";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
});

describe("KAN-11 speech-to-text", () => {
  it("TC-001 returns transcript text for valid audio when provider succeeds", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "  book an appointment tomorrow  " }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const service = new SttService({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
      fetchImpl: fetchMock as typeof fetch,
    });
    const result = await service.transcribe({
      audio: new Uint8Array([1, 2, 3, 4]),
      mimeType: "audio/webm",
    });

    expect(result.text).toBe("book an appointment tomorrow");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });

  it("TC-002 fails closed when STT is not configured", async () => {
    const service = new SttService({ apiKey: undefined, provider: undefined });
    await expect(service.transcribe({ audio: new Uint8Array([1, 2, 3]) })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(service.transcribe({ audio: new Uint8Array([1, 2, 3]) })).rejects.toThrow(
      /not configured/i,
    );
  });

  it("TC-003 maps provider failures without leaking secrets", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "boom sk-secret-should-not-leak" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const service = new SttService({
      apiKey: "sk-secret-should-not-leak",
      provider: "openai",
      model: "whisper-1",
      fetchImpl: fetchMock as typeof fetch,
    });
    await expect(service.transcribe({ audio: new Uint8Array([9, 9, 9]) })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );

    try {
      await service.transcribe({ audio: new Uint8Array([9, 9, 9]) });
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect((error as Error).message).not.toContain("sk-secret-should-not-leak");
      expect((error as Error).message).toMatch(/status 500/i);
    }
  });

  it("TC-004 rejects empty or invalid audio", async () => {
    const service = new SttService({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
    });
    await expect(service.transcribe({ audio: new Uint8Array([]) })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("POST /api/stt/transcribe returns text for valid base64 audio", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "hello clinic" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    process.env.APP_ENV = "test";
    process.env.STT_PROVIDER = "openai";
    process.env.STT_API_KEY = "sk-http-test";
    process.env.STT_MODEL = "whisper-1";
    resetConfigCache();

    const app = createApp();
    const audioBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
    const response = await request(app)
      .post("/api/stt/transcribe")
      .send({ audioBase64, mimeType: "audio/webm" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: "hello clinic" });
  });

  it("POST /api/stt/transcribe validates missing audioBase64", async () => {
    process.env.APP_ENV = "test";
    process.env.STT_PROVIDER = "openai";
    process.env.STT_API_KEY = "sk-http-test";
    resetConfigCache();

    const app = createApp();
    const response = await request(app).post("/api/stt/transcribe").send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/sk-http-test/);
  });
});
