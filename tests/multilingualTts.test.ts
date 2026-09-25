import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { LlmService } from "../src/ai/llmService";
import { ConversationService } from "../src/conversation/conversationService";
import { ExternalServiceError } from "../src/utils/errors";
import { resetConfigCache } from "../src/config";
import { SttService } from "../src/voice/sttService";
import {
  TtsService,
  resolveTtsVoice,
  TTS_VOICE_BY_LANGUAGE,
} from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("KAN-26 multilingual TTS", () => {
  it("TC-001 English defaults to alloy voice", async () => {
    expect(resolveTtsVoice("en")).toBe("alloy");
    expect(TTS_VOICE_BY_LANGUAGE.en).toBe("alloy");

    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
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
    await service.synthesize({ text: "Hello, how can I help?", language: "en" });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      voice: string;
      input: string;
    };
    expect(body.voice).toBe("alloy");
    expect(body.input).toContain("Hello");
  });

  it("TC-002 Hindi defaults to nova voice", async () => {
    expect(resolveTtsVoice("hi")).toBe("nova");

    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
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
    await service.synthesize({ text: "Namaste, main madad karunga.", language: "hi" });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      voice: string;
    };
    expect(body.voice).toBe("nova");
  });

  it("TC-003 Hinglish defaults to nova; explicit voice wins", async () => {
    expect(resolveTtsVoice("hinglish")).toBe("nova");
    expect(resolveTtsVoice("hinglish", "shimmer")).toBe("shimmer");
    expect(resolveTtsVoice("hi", "echo")).toBe("echo");

    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([9, 9]), {
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
    await service.synthesize({
      text: "Theek hai, main help karunga tomorrow.",
      language: "hinglish",
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      voice: string;
    };
    expect(body.voice).toBe("nova");
  });

  it("TC-004 soft-fail still returns text when TTS fails with language set", async () => {
    const stt = {
      transcribe: vi.fn(async () => ({
        text: "Namaste, mujhe milna hai",
        language: "hi",
        supported: true,
      })),
    } as unknown as SttService;
    const llm = {
      complete: vi.fn(async () => ({ text: "Main madad karunga." })),
    } as unknown as LlmService;
    const tts = {
      synthesize: vi.fn(async () => {
        throw new ExternalServiceError("tts", "provider down");
      }),
    } as unknown as TtsService;

    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts,
      conversation: new ConversationService(),
    });
    const result = await pipeline.runTurn({ audio: new Uint8Array([1, 2, 3]) });
    expect(result.replyText).toMatch(/madad/i);
    expect(result.ttsError?.service).toBe("tts");
    expect(result.audioBase64).toBeUndefined();
    expect(tts.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ language: "hi", text: "Main madad karunga." }),
    );
  });

  it("voice pipeline passes reply language into tts.synthesize", async () => {
    const synthesize = vi.fn(async () => ({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/mpeg",
    }));
    const pipeline = new VoicePipelineService({
      stt: {
        transcribe: vi.fn(async () => ({
          text: "Mujhe appointment book karna hai tomorrow",
          language: "en",
          supported: true,
        })),
      } as unknown as SttService,
      llm: { complete: vi.fn(async () => ({ text: "Sure, I can help." })) } as unknown as LlmService,
      tts: { synthesize } as unknown as TtsService,
      conversation: new ConversationService(),
    });

    await pipeline.runTurn({ audio: new Uint8Array([4, 5, 6]) });
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ language: "hinglish" }),
    );
  });

  it("POST /api/tts/synthesize accepts language and maps voice", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(Buffer.from([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TTS_PROVIDER", "openai");
    vi.stubEnv("TTS_API_KEY", "sk-test");
    vi.stubEnv("TTS_MODEL", "tts-1");
    resetConfigCache();

    const res = await request(createApp())
      .post("/api/tts/synthesize")
      .send({ text: "Namaste", language: "hi" });
    expect(res.status).toBe(200);
    expect(res.body.audioBase64).toBeTruthy();
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      voice: string;
    };
    expect(body.voice).toBe("nova");
  });
});
