import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { LlmService } from "../src/ai/llmService";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { conversationService } from "../src/conversation/conversationService";
import { callEventRepository } from "../src/repositories/callEventRepository";
import { callRepository } from "../src/repositories/callRepository";
import { conversationStateRepository } from "../src/repositories/conversationStateRepository";
import { SessionService } from "../src/services/sessionService";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

function mockStt(text: string): SttService {
  return {
    transcribe: vi.fn(async () => ({ text, language: "en", supported: true })),
  } as unknown as SttService;
}

function mockLlm(text: string): LlmService {
  return {
    complete: vi.fn(async () => ({ text })),
  } as unknown as LlmService;
}

function mockTts(): TtsService {
  return {
    synthesize: vi.fn(async () => ({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg" })),
  } as unknown as TtsService;
}

describe("KAN-28 language preference & session state", () => {
  beforeAll(async () => {
    testDatabase = await ensureTestDatabase();
    await connectDatabase();
    await runMigrations();
  });

  beforeEach(async () => {
    conversationService.clear();
    await getPool().query(
      "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
    );
  });

  afterEach(() => {
    conversationService.clear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closePool();
    await testDatabase?.stop();
  });

  it("TC-001 defaults language to en when omitted on create", async () => {
    const service = new SessionService();
    const session = await service.startSession({ callerNumber: "browser" });

    expect(session.language).toBe("en");

    const call = await callRepository.findById(session.callId);
    const state = await conversationStateRepository.findByCallId(session.callId);
    expect(call?.language).toBe("en");
    expect(state?.language).toBe("en");

    const res = await request(createApp()).post("/api/sessions").send({});
    expect(res.status).toBe(201);
    expect(res.body.language).toBe("en");
  });

  it("TC-002 persists detected language on voice turn (hi)", async () => {
    const service = new SessionService();
    const started = await service.startSession({ language: "en" });

    const pipeline = new VoicePipelineService({
      stt: mockStt("Namaste, mujhe milna hai"),
      llm: mockLlm("Theek hai, main madad karunga."),
      tts: mockTts(),
      sessions: service,
    });

    const result = await pipeline.runTurn({
      audio: new Uint8Array([1, 2, 3]),
      callId: started.callId,
    });

    expect(result.languageDetection?.language).toBe("hi");
    expect(result.language).toBe("hi");

    const call = await callRepository.findById(started.callId);
    const state = await conversationStateRepository.findByCallId(started.callId);
    expect(call?.language).toBe("hi");
    expect(state?.language).toBe("hi");

    const events = await callEventRepository.listByCallId(started.callId);
    const changed = events.find((e) => e.eventType === "LANGUAGE_CHANGED");
    expect(changed?.metadata).toMatchObject({ from: "en", to: "hi" });
  });

  it("TC-003 keeps hinglish across a subsequent turn", async () => {
    const service = new SessionService();
    const started = await service.startSession({ language: "en" });
    const pipeline = new VoicePipelineService({
      stt: mockStt("Mujhe appointment book karna hai tomorrow"),
      llm: mockLlm("Sure, I can help."),
      tts: mockTts(),
      sessions: service,
    });

    const first = await pipeline.runTurn({
      audio: new Uint8Array([1, 2, 3]),
      callId: started.callId,
    });
    expect(first.language).toBe("hinglish");

    // Unclear / empty-ish punctuation should not wipe preference.
    const secondPipeline = new VoicePipelineService({
      stt: mockStt("..."),
      llm: mockLlm("Still here."),
      tts: mockTts(),
      sessions: service,
    });
    // Force empty-ish transcript that detection marks unclear — use punctuation-only
    // by mocking STT to return something detection treats as unclear.
    (secondPipeline as unknown as { stt: SttService }).stt = mockStt("???");
    const second = await secondPipeline.runTurn({
      audio: new Uint8Array([4, 5, 6]),
      callId: started.callId,
    });

    expect(second.language).toBe("hinglish");
    const state = await conversationStateRepository.findByCallId(started.callId);
    expect(state?.language).toBe("hinglish");

    const getRes = await request(createApp()).get(`/api/sessions/${started.callId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.language).toBe("hinglish");
  });

  it("TC-004 rejects unsupported language on create", async () => {
    const service = new SessionService();
    await expect(service.startSession({ language: "fr" })).rejects.toThrow(/language must be/i);

    const res = await request(createApp()).post("/api/sessions").send({ language: "es" });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("does not change session language on unsupported utterance", async () => {
    const service = new SessionService();
    const started = await service.startSession({ language: "hi" });

    const pipeline = new VoicePipelineService({
      stt: {
        transcribe: vi.fn(async () => ({
          text: "Bonjour, je voudrais un rendez-vous",
          language: "fr",
          supported: false,
        })),
      } as unknown as SttService,
      llm: mockLlm("should not run"),
      tts: mockTts(),
      sessions: service,
    });

    const result = await pipeline.runTurn({
      audio: new Uint8Array([9, 9, 9]),
      callId: started.callId,
    });

    expect(result.languageDetection?.unsupported).toBe(true);
    expect(result.language).toBe("hi");

    const state = await conversationStateRepository.findByCallId(started.callId);
    expect(state?.language).toBe("hi");

    const events = await callEventRepository.listByCallId(started.callId);
    expect(events.map((e) => e.eventType)).not.toContain("LANGUAGE_CHANGED");
  });
});
