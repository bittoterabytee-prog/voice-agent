import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { ExternalServiceError, ValidationError } from "../src/utils/errors";
import { normalizeProviderLanguage, resolveWhisperLanguage, SttService } from "../src/voice/sttService";
import { resetConfigCache } from "../src/config";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
  delete process.env.STT_DEFAULT_LANGUAGE;
});

async function readFormLanguage(init: RequestInit | undefined): Promise<{
  language: string | null;
  responseFormat: string | null;
  prompt: string | null;
}> {
  const body = init?.body as FormData;
  return {
    language: body.get("language") as string | null,
    responseFormat: body.get("response_format") as string | null,
    prompt: body.get("prompt") as string | null,
  };
}

describe("KAN-11 / KAN-24 speech-to-text", () => {
  it("TC-001 returns transcript text for valid audio when provider succeeds", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "  book an appointment tomorrow  ", language: "en" }), {
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
    expect(result.language).toBe("en");
    expect(result.supported).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
    const form = await readFormLanguage(init as RequestInit);
    expect(form.responseFormat).toBe("verbose_json");
    expect(form.prompt).toMatch(/Hinglish/i);
    expect(form.language).toBeNull();
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

  it("KAN-24 maps language hints for English and Hindi Whisper language", () => {
    expect(resolveWhisperLanguage("en")).toBe("en");
    expect(resolveWhisperLanguage("en-US")).toBe("en");
    expect(resolveWhisperLanguage("hi")).toBe("hi");
    expect(resolveWhisperLanguage("hi-IN")).toBe("hi");
    expect(resolveWhisperLanguage("hinglish")).toBeUndefined();
    expect(resolveWhisperLanguage("auto")).toBeUndefined();
    expect(normalizeProviderLanguage("english")).toBe("en");
    expect(normalizeProviderLanguage("hindi")).toBe("hi");
  });

  it("KAN-24 normalizes verbose_json English language names to ISO codes", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "hello", language: "english" }), {
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
    const result = await service.transcribe({ audio: new Uint8Array([1, 2, 3, 4]) });
    expect(result.language).toBe("en");
  });

  it("KAN-24 TC-001/002 passes languageHint into Whisper and returns provider language", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "मुझे कल आना है", language: "hi" }), {
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
      languageHint: "hi",
    });

    expect(result.text).toBe("मुझे कल आना है");
    expect(result.language).toBe("hi");
    expect(result.supported).toBe(true);
    const form = await readFormLanguage(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(form.language).toBe("hi");
  });

  it("KAN-24 omits Whisper language for hinglish so mixed speech can auto-detect", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ text: "Mujhe kal ka appointment chahiye", language: "en" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const service = new SttService({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
      fetchImpl: fetchMock as typeof fetch,
    });
    await service.transcribe({
      audio: new Uint8Array([1, 2, 3, 4]),
      languageHint: "hinglish",
    });

    const form = await readFormLanguage(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(form.language).toBeNull();
  });

  it("KAN-24 uses STT_DEFAULT_LANGUAGE when request has no hint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "hello", language: "en" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const service = new SttService({
      apiKey: "sk-test",
      provider: "openai",
      model: "whisper-1",
      defaultLanguage: "en",
      fetchImpl: fetchMock as typeof fetch,
    });
    await service.transcribe({ audio: new Uint8Array([1, 2, 3, 4]) });

    const form = await readFormLanguage(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(form.language).toBe("en");
  });

  it("POST /api/stt/transcribe returns text for valid base64 audio", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "hello clinic", language: "en" }), {
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
      .send({ audioBase64, mimeType: "audio/webm", languageHint: "en" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: "hello clinic", language: "en", supported: true });
    const form = await readFormLanguage(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(form.language).toBe("en");
  });

  it("KAN-24 ignores out-of-scope language hints and flags unsupported provider languages", async () => {
    expect(resolveWhisperLanguage("fr")).toBeUndefined();
    expect(resolveWhisperLanguage("es-ES")).toBeUndefined();

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "Bonjour, je voudrais un rendez-vous", language: "french" }), {
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
      languageHint: "fr",
    });

    expect(result.language).toBe("fr");
    expect(result.supported).toBe(false);
    const form = await readFormLanguage(fetchMock.mock.calls[0]![1] as RequestInit);
    expect(form.language).toBeNull();
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
