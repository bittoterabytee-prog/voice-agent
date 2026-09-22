import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { LlmService } from "../src/ai/llmService";
import { ConversationService } from "../src/conversation/conversationService";
import { resetConfigCache } from "../src/config";
import { ExternalServiceError, ValidationError } from "../src/utils/errors";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockStt(text: string): SttService {
  return {
    transcribe: vi.fn(async () => ({ text })),
  } as unknown as SttService;
}

function mockLlm(text: string): LlmService {
  return {
    complete: vi.fn(async () => ({ text })),
  } as unknown as LlmService;
}

function mockTts(audio: Uint8Array = new Uint8Array([1, 2, 3]), mimeType = "audio/mpeg"): TtsService {
  return {
    synthesize: vi.fn(async () => ({ audio, mimeType })),
  } as unknown as TtsService;
}

describe("KAN-14 realtime voice conversation pipeline", () => {
  it("TC-001 returns transcript, reply text, and audio for one full turn", async () => {
    const stt = mockStt("I need an appointment");
    const llm = mockLlm("I can help you schedule that.");
    const tts = mockTts(new Uint8Array([9, 8, 7]));
    const conversation = new ConversationService();

    const pipeline = new VoicePipelineService({ stt, llm, tts, conversation });
    const result = await pipeline.runTurn({
      audio: new Uint8Array([10, 20, 30]),
      mimeType: "audio/webm",
      sessionId: "browser-test-1",
    });

    expect(result.transcript).toBe("I need an appointment");
    expect(result.replyText).toBe("I can help you schedule that.");
    expect(result.audioBase64).toBe(Buffer.from([9, 8, 7]).toString("base64"));
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.ttsError).toBeUndefined();
    expect(result.conversationId).toBeTruthy();
    expect(result.sessionId).toBe("browser-test-1");

    const stored = conversation.get(result.conversationId);
    expect(stored?.turns).toHaveLength(2);
    expect(stored?.turns[0]).toMatchObject({ role: "user", content: "I need an appointment" });
    expect(stored?.turns[1]).toMatchObject({
      role: "assistant",
      content: "I can help you schedule that.",
    });
  });

  it("TC-002 surfaces STT failure without inventing a booking reply", async () => {
    const stt = {
      transcribe: vi.fn(async () => {
        throw new ExternalServiceError("stt", "Speech-to-text provider is unavailable");
      }),
    } as unknown as SttService;
    const llm = mockLlm("should not run");
    const tts = mockTts();
    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts,
      conversation: new ConversationService(),
    });

    await expect(pipeline.runTurn({ audio: new Uint8Array([1]) })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(pipeline.runTurn({ audio: new Uint8Array([1]) })).rejects.toThrow(/speech-to-text/i);
    expect(llm.complete).not.toHaveBeenCalled();
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("TC-003 returns recoverable error when LLM fails after STT", async () => {
    const stt = mockStt("hello");
    const llm = {
      complete: vi.fn(async () => {
        throw new ExternalServiceError("llm", "LLM provider is unavailable");
      }),
    } as unknown as LlmService;
    const tts = mockTts();
    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts,
      conversation: new ConversationService(),
    });

    await expect(pipeline.runTurn({ audio: new Uint8Array([1]) })).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
    await expect(pipeline.runTurn({ audio: new Uint8Array([1]) })).rejects.toThrow(/llm/i);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it("TC-004 keeps text reply when TTS fails after LLM", async () => {
    const stt = mockStt("hello clinic");
    const llm = mockLlm("Hello, how can I help?");
    const tts = {
      synthesize: vi.fn(async () => {
        throw new ExternalServiceError("tts", "Text-to-speech provider is unavailable");
      }),
    } as unknown as TtsService;

    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts,
      conversation: new ConversationService(),
    });
    const result = await pipeline.runTurn({ audio: new Uint8Array([1, 2]) });

    expect(result.transcript).toBe("hello clinic");
    expect(result.replyText).toBe("Hello, how can I help?");
    expect(result.audioBase64).toBeUndefined();
    expect(result.ttsError).toMatchObject({
      service: "tts",
      code: "EXTERNAL_SERVICE_UNAVAILABLE",
    });
    expect(result.ttsError?.message).toMatch(/text-to-speech/i);
  });

  it("rejects empty audio before calling providers", async () => {
    const stt = mockStt("x");
    const llm = mockLlm("y");
    const tts = mockTts();
    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts,
      conversation: new ConversationService(),
    });

    await expect(pipeline.runTurn({ audio: new Uint8Array() })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(stt.transcribe).not.toHaveBeenCalled();
  });

  it("POST /api/voice/turn completes audio→text→LLM→audio over HTTP", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/audio/transcriptions")) {
        return new Response(JSON.stringify({ text: "Book next Tuesday" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Sure, let me check availability." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/audio/speech")) {
        return new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    process.env.STT_PROVIDER = "openai";
    process.env.STT_API_KEY = "sk-stt";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_API_KEY = "sk-llm";
    process.env.TTS_PROVIDER = "openai";
    process.env.TTS_API_KEY = "sk-tts";
    resetConfigCache();

    const app = createApp();
    const res = await request(app)
      .post("/api/voice/turn")
      .send({
        audioBase64: Buffer.from([1, 2, 3]).toString("base64"),
        mimeType: "audio/webm",
        sessionId: "browser-http-1",
      });

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("Book next Tuesday");
    expect(res.body.replyText).toBe("Sure, let me check availability.");
    expect(res.body.audioBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(res.body.mimeType).toBe("audio/mpeg");
    expect(res.body.conversationId).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("POST /api/voice/turn returns 502 when STT fails mid-pipeline", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    process.env.STT_PROVIDER = "openai";
    process.env.STT_API_KEY = "sk-stt";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_API_KEY = "sk-llm";
    process.env.TTS_PROVIDER = "openai";
    process.env.TTS_API_KEY = "sk-tts";
    resetConfigCache();

    const app = createApp();
    const res = await request(app)
      .post("/api/voice/turn")
      .send({ audioBase64: Buffer.from([1]).toString("base64") });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
    expect(JSON.stringify(res.body)).not.toContain("sk-stt");
  });
});
