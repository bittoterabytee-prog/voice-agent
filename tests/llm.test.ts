import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { CLINIC_SYSTEM_PROMPT } from "../src/ai/prompts";
import { LlmService } from "../src/ai/llmService";
import { ExternalServiceError, ValidationError } from "../src/utils/errors";
import { resetConfigCache } from "../src/config";

afterEach(() => {
  resetConfigCache();
  vi.unstubAllGlobals();
});

describe("KAN-12 LLM conversation service", () => {
  it("TC-001 returns assistant text when provider succeeds", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "  I can help you schedule.  " } }],
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
    const result = await service.complete({ prompt: "I need an appointment" });

    expect(result.text).toBe("I can help you schedule.");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
    const body = JSON.parse(String((init as RequestInit).body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toContain("Never invent open appointment slots");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "I need an appointment" });
  });

  it("TC-002 fails closed when LLM is not configured", async () => {
    const service = new LlmService({ apiKey: undefined, provider: undefined });
    await expect(service.complete({ prompt: "hello" })).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(service.complete({ prompt: "hello" })).rejects.toThrow(/not configured/i);
  });

  it("TC-003 maps provider failures without leaking secrets", async () => {
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
      await service.complete({ prompt: "hello" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect((error as Error).message).not.toContain("sk-secret-should-not-leak");
      expect((error as Error).message).toMatch(/status 503/i);
    }
  });

  it("TC-004 system prompt requires backend tools for availability (no invented slots)", () => {
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/Never invent open appointment slots/i);
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/backend tools/i);
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/Never claim an appointment was booked/i);
    expect(CLINIC_SYSTEM_PROMPT).toMatch(/medical diagnosis/i);
  });

  it("includes prior conversation turns in the provider request", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Tuesday at 10 works." } }],
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
      messages: [
        { role: "user", content: "Do you have openings?" },
        { role: "assistant", content: "I will check with the scheduling system." },
        { role: "user", content: "Tuesday morning please" },
      ],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages.filter((m) => m.role !== "system")).toEqual([
      { role: "user", content: "Do you have openings?" },
      { role: "assistant", content: "I will check with the scheduling system." },
      { role: "user", content: "Tuesday morning please" },
    ]);
  });

  it("returns toolCalls when enableTools is set and provider requests a tool", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "check_availability",
                        arguments: JSON.stringify({ date: "2026-09-22" }),
                      },
                    },
                  ],
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
    const result = await service.complete({ prompt: "Any slots tomorrow?", enableTools: true });

    expect(result.text).toBe("");
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "check_availability", arguments: { date: "2026-09-22" } },
    ]);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as { tools?: unknown[] };
    expect(body.tools?.length).toBeGreaterThan(0);
  });

  it("rejects empty prompt and messages", async () => {
    const service = new LlmService({
      apiKey: "sk-test",
      provider: "openai",
      model: "gpt-4o-mini",
    });
    await expect(service.complete({})).rejects.toBeInstanceOf(ValidationError);
  });

  it("POST /api/llm/complete returns assistant text", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Hello from the clinic assistant." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    process.env.APP_ENV = "test";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_API_KEY = "sk-http-test";
    process.env.LLM_MODEL = "gpt-4o-mini";
    resetConfigCache();

    const app = createApp();
    const response = await request(app)
      .post("/api/llm/complete")
      .send({ prompt: "Hi" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ text: "Hello from the clinic assistant." });
    expect(JSON.stringify(response.body)).not.toMatch(/sk-http-test/);
  });

  it("POST /api/llm/complete validates missing input", async () => {
    process.env.APP_ENV = "test";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_API_KEY = "sk-http-test";
    resetConfigCache();

    const app = createApp();
    const response = await request(app).post("/api/llm/complete").send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/sk-http-test/);
  });
});
