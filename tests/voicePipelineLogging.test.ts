import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/ai/llmService";
import { ConversationService } from "../src/conversation/conversationService";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { callEventRepository } from "../src/repositories/callEventRepository";
import { SessionService } from "../src/services/sessionService";
import { ExternalServiceError, ValidationError } from "../src/utils/errors";
import { logger } from "../src/utils/logger";
import { redactSecrets, redactValue } from "../src/utils/redact";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";
import { errorHandler } from "../src/middleware/errorHandler";
import type { NextFunction, Request, Response } from "express";

let testDatabase: TestDatabaseHandle | undefined;

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

function mockResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe("KAN-18 voice pipeline logging & error handling", () => {
  beforeAll(async () => {
    testDatabase = await ensureTestDatabase();
    await connectDatabase();
    await runMigrations();
  });

  beforeEach(async () => {
    await getPool().query(
      "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closePool();
    await testDatabase?.stop();
  });

  it("TC-001 happy path emits correlated stage logs and speech events", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });

    const pipeline = new VoicePipelineService({
      stt: mockStt("I need an appointment"),
      llm: mockLlm("I can help you schedule that."),
      tts: mockTts(new Uint8Array([9, 8, 7])),
      sessions,
      conversation: new ConversationService(),
    });

    const result = await pipeline.runTurn({
      audio: new Uint8Array([10, 20, 30]),
      callId: started.callId,
      requestId: "req-happy-1",
      sessionId: "browser-test-1",
    });

    expect(result.requestId).toBe("req-happy-1");
    expect(result.transcript).toBe("I need an appointment");
    expect(result.replyText).toBe("I can help you schedule that.");
    expect(result.audioBase64).toBeTruthy();
    expect(result.ttsError).toBeUndefined();
    expect(result.pipeline?.requestId).toBe("req-happy-1");
    expect(result.pipeline?.stages.map((s) => s.stage)).toEqual(["stt", "llm", "tts"]);
    expect(result.pipeline?.stages.every((s) => s.outcome === "success")).toBe(true);
    expect(result.cost?.currency).toBe("USD");
    expect(result.cost?.estimatedUsd).toBeGreaterThan(0);
    expect(result.cost?.breakdown.map((b) => b.stage)).toEqual(
      expect.arrayContaining(["stt", "llm", "tts"]),
    );

    const events = await callEventRepository.listByCallId(started.callId);
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["CALL_STARTED", "USER_SPEECH", "AGENT_RESPONSE", "TOOL_CALLED"]),
    );
    const usage = events.find(
      (e) => e.eventType === "TOOL_CALLED" && (e.metadata as { kind?: string })?.kind === "openai_usage",
    );
    expect(usage?.metadata).toMatchObject({
      kind: "openai_usage",
      currency: "USD",
      requestId: "req-happy-1",
    });
    expect(Number((usage?.metadata as { estimatedUsd?: number })?.estimatedUsd)).toBeGreaterThan(0);

    const spend = await sessions.getSpendSummary();
    expect(spend.estimatedUsdTotal).toBeGreaterThan(0);
    expect(spend.turnCount).toBeGreaterThanOrEqual(1);
    expect(spend.note).toMatch(/not a live OpenAI wallet/i);

    const stageLogs = infoSpy.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .filter((payload) => payload?.component === "voice_pipeline");
    expect(stageLogs.some((p) => p.stage === "stt" && p.outcome === "success")).toBe(true);
    expect(stageLogs.some((p) => p.stage === "llm" && p.outcome === "success")).toBe(true);
    expect(stageLogs.some((p) => p.stage === "tts" && p.outcome === "success")).toBe(true);
    expect(stageLogs.some((p) => p.requestId === "req-happy-1" && p.callId === started.callId)).toBe(
      true,
    );
    expect(JSON.stringify(stageLogs)).not.toMatch(/sk-[a-z0-9]/i);
  });

  it("TC-002 validation error stays sanitized", async () => {
    const pipeline = new VoicePipelineService({
      stt: mockStt("x"),
      llm: mockLlm("y"),
      tts: mockTts(),
      conversation: new ConversationService(),
    });

    await expect(pipeline.runTurn({ audio: new Uint8Array(), requestId: "req-val" })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const res = mockResponse();
    errorHandler(
      new ValidationError("Audio payload is empty or invalid"),
      { id: "req-val" } as Request,
      res,
      vi.fn() as unknown as NextFunction,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Audio payload is empty or invalid" },
    });
  });

  it("TC-003 STT failure records TOOL_FAILED call_event when callId set", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });
    const stt = {
      transcribe: vi.fn(async () => {
        throw new ExternalServiceError("stt", "Speech-to-text failed with sk-secretkey123456");
      }),
    } as unknown as SttService;

    const pipeline = new VoicePipelineService({
      stt,
      llm: mockLlm("should not run"),
      tts: mockTts(),
      sessions,
      conversation: new ConversationService(),
    });

    await expect(
      pipeline.runTurn({
        audio: new Uint8Array([1]),
        callId: started.callId,
        requestId: "req-stt-fail",
      }),
    ).rejects.toBeInstanceOf(ExternalServiceError);

    const events = await callEventRepository.listByCallId(started.callId);
    const failure = events.find((e) => e.eventType === "TOOL_FAILED");
    expect(failure).toBeTruthy();
    expect(failure?.metadata).toMatchObject({
      kind: "voice_pipeline",
      stage: "stt",
      softFail: false,
      requestId: "req-stt-fail",
    });
    expect(JSON.stringify(failure?.metadata)).not.toContain("sk-secretkey123456");
    expect(JSON.stringify(failure?.metadata)).toContain("[REDACTED]");
  });

  it("TC-004 TTS soft-fail logs and stores call_event while returning text", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });
    const tts = {
      synthesize: vi.fn(async () => {
        throw new ExternalServiceError("tts", "TTS unavailable api_key=sk-ttstoken999");
      }),
    } as unknown as TtsService;

    const pipeline = new VoicePipelineService({
      stt: mockStt("hello clinic"),
      llm: mockLlm("Hello, how can I help?"),
      tts,
      sessions,
      conversation: new ConversationService(),
    });

    const result = await pipeline.runTurn({
      audio: new Uint8Array([1, 2]),
      callId: started.callId,
      requestId: "req-tts-soft",
    });

    expect(result.replyText).toBe("Hello, how can I help?");
    expect(result.audioBase64).toBeUndefined();
    expect(result.ttsError?.service).toBe("tts");
    expect(result.ttsError?.message).not.toContain("sk-ttstoken999");
    expect(result.ttsError?.message).toContain("[REDACTED]");

    expect(result.pipeline?.stages.some((s) => s.stage === "tts" && s.softFail === true)).toBe(
      true,
    );

    const events = await callEventRepository.listByCallId(started.callId);
    const failure = events.find((e) => e.eventType === "TOOL_FAILED");
    expect(failure?.metadata).toMatchObject({
      kind: "voice_pipeline",
      stage: "tts",
      softFail: true,
    });
  });

  it("TC-005 redacts secrets from client error payloads and redact helpers", () => {
    expect(redactSecrets("Bearer sk-abcdefghilmnopqr is bad")).toContain("[REDACTED]");
    expect(redactSecrets("api_key=sk-abcdefghilmnopqr")).toContain("[REDACTED]");
    expect(JSON.stringify(redactValue({ apiKey: "sk-abcdefghilmnopqr", ok: true }))).not.toContain(
      "sk-abcdefghilmnopqr",
    );

    const res = mockResponse();
    errorHandler(
      new ExternalServiceError("llm", "provider rejected key sk-llmtokenABCDEFGH"),
      { id: "req-redact" } as Request,
      res,
      vi.fn() as unknown as NextFunction,
    );

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("sk-llmtokenABCDEFGH");
    expect((res.body as { error: { message: string } }).error.message).toContain("[REDACTED]");
  });
});
