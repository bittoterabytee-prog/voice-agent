import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { LlmService } from "../src/ai/llmService";
import {
  CLINIC_SYSTEM_PROMPT,
  buildSystemMessage,
  resolveReplyLanguage,
} from "../src/ai/prompts";
import { ExternalServiceError } from "../src/utils/errors";
import { resetConfigCache } from "../src/config";
import { ConversationService } from "../src/conversation/conversationService";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function captureSystemPrompt(fetchMock: ReturnType<typeof vi.fn>): string {
  const [, init] = fetchMock.mock.calls[0]!;
  const body = JSON.parse(String((init as RequestInit).body)) as {
    messages: Array<{ role: string; content: string }>;
  };
  expect(body.messages[0]?.role).toBe("system");
  return body.messages[0]!.content;
}

describe("KAN-25 multilingual LLM conversation", () => {
  it("TC-001 English reply instructions in system prompt", async () => {
    expect(resolveReplyLanguage("en")).toBe("en");
    const system = buildSystemMessage({ language: "en" });
    expect(system.content).toContain(CLINIC_SYSTEM_PROMPT);
    expect(system.content).toMatch(/Reply language for this turn: English/i);
    expect(system.content).toMatch(/single utterance|Hinglish/i);

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "I can help with that." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const service = new LlmService({
      apiKey: "sk-test",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchMock as typeof fetch,
    });
    const result = await service.complete({
      prompt: "I need an appointment tomorrow",
      language: "en",
    });
    expect(result.text).toMatch(/help/i);
    expect(captureSystemPrompt(fetchMock)).toMatch(/Reply language for this turn: English/i);
  });

  it("TC-002 Hindi reply instructions in system prompt", async () => {
    const system = buildSystemMessage({ language: "hi" });
    expect(system.content).toMatch(/Reply language for this turn: Hindi/i);
    expect(system.content).toMatch(/natural Hindi/i);

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Main madad kar sakta hoon." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const service = new LlmService({
      apiKey: "sk-test",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchMock as typeof fetch,
    });
    await service.complete({ prompt: "Mujhe milna hai", language: "hi" });
    expect(captureSystemPrompt(fetchMock)).toMatch(/Reply language for this turn: Hindi/i);
  });

  it("TC-003 Hinglish is one utterance / one engine guidance", async () => {
    const system = buildSystemMessage({ language: "hinglish" });
    expect(system.content).toMatch(/Reply language for this turn: Hinglish/i);
    expect(system.content).toMatch(/mixed Hindi and English/i);
    expect(system.content).toMatch(/Do not split/i);
    expect(system.content).toMatch(/single utterance|one coherent/i);

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Theek hai, main aapka appointment help karunga.",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const service = new LlmService({
      apiKey: "sk-test",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchMock as typeof fetch,
    });
    await service.complete({
      prompt: "Mujhe appointment book karna hai tomorrow",
      language: "hinglish",
    });
    expect(captureSystemPrompt(fetchMock)).toMatch(/Hinglish/i);
  });

  it("TC-004 preserves prior English context after Hindi language switch", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Kal dopahar theek hai." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const service = new LlmService({
      apiKey: "sk-test",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchMock as typeof fetch,
    });

    await service.complete({
      language: "hi",
      messages: [
        { role: "user", content: "I need a cardiologist on Tuesday" },
        { role: "assistant", content: "I can help with that. What time works?" },
        { role: "user", content: "Kal dopahar theek rahega" },
      ],
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]?.content).toMatch(/Reply language for this turn: Hindi/i);
    expect(body.messages).toEqual(
      expect.arrayContaining([
        { role: "user", content: "I need a cardiologist on Tuesday" },
        { role: "assistant", content: "I can help with that. What time works?" },
        { role: "user", content: "Kal dopahar theek rahega" },
      ]),
    );
    // Still a single engine — one system prompt, not separate agents.
    expect(body.messages.filter((m) => m.role === "system")).toHaveLength(1);
  });

  it("TC-005 provider failure returns 502 without leaking secrets", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "boom sk-secret-should-not-leak" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    );

    const service = new LlmService({
      apiKey: "sk-secret-should-not-leak",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchMock as typeof fetch,
    });

    try {
      await service.complete({ prompt: "hello", language: "hi" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect((error as Error).message).not.toContain("sk-secret-should-not-leak");
    }

    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-secret-should-not-leak");
    vi.stubEnv("LLM_MODEL", "gpt-4o-mini");
    resetConfigCache();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(createApp())
      .post("/api/llm/complete")
      .send({ prompt: "hello", language: "en" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("sk-secret-should-not-leak");
    expect(res.body.error?.code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
  });

  it("voice pipeline passes detected language into llm.complete", async () => {
    const complete = vi.fn(async () => ({ text: "Main madad karunga." }));
    const llm = { complete } as unknown as LlmService;
    const stt = {
      transcribe: vi.fn(async () => ({
        text: "Namaste, mujhe milna hai",
        language: "hi",
        supported: true,
      })),
    } as unknown as SttService;
    const tts = {
      synthesize: vi.fn(async () => ({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: "audio/mpeg",
      })),
    } as unknown as TtsService;

    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts,
      conversation: new ConversationService(),
    });

    await pipeline.runTurn({ audio: new Uint8Array([1, 2, 3]) });

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]![0]).toMatchObject({
      language: "hi",
      enableTools: false,
      includeSystemPrompt: true,
    });
  });

  it("defaults invalid language to en in the system prompt", () => {
    expect(resolveReplyLanguage("fr")).toBe("en");
    expect(buildSystemMessage({ language: "fr" }).content).toMatch(
      /Reply language for this turn: English/i,
    );
  });
});
