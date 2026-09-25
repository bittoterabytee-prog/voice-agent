import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/ai/llmService";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { conversationService } from "../src/conversation/conversationService";
import { callEventRepository } from "../src/repositories/callEventRepository";
import { SessionService } from "../src/services/sessionService";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

function mockStt(text: string, language = "en"): SttService {
  return {
    transcribe: vi.fn(async () => ({ text, language, supported: true })),
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

describe("KAN-27 dynamic language switching", () => {
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

  it("TC-001 switches EN → HI and preserves context on the same callId", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });
    const llm = mockLlm("I can help with that.");
    const tts = mockTts();

    const enPipeline = new VoicePipelineService({
      stt: mockStt("I need a cardiologist on Tuesday", "en"),
      llm,
      tts,
      sessions,
    });
    const turn1 = await enPipeline.runTurn({
      audio: new Uint8Array([1, 2, 3]),
      callId: started.callId,
    });
    expect(turn1.language).toBe("en");
    expect(turn1.languageChanged).toBe(false);
    expect(turn1.callId).toBe(started.callId);

    const hiLlm = mockLlm("Theek hai, main madad karunga.");
    const hiTts = mockTts();
    const hiPipeline = new VoicePipelineService({
      stt: mockStt("Namaste, mujhe milna hai", "hi"),
      llm: hiLlm,
      tts: hiTts,
      sessions,
    });
    const turn2 = await hiPipeline.runTurn({
      audio: new Uint8Array([4, 5, 6]),
      callId: started.callId,
    });

    expect(turn2.callId).toBe(started.callId);
    expect(turn2.language).toBe("hi");
    expect(turn2.languageChanged).toBe(true);
    expect(turn2.languageDetection?.language).toBe("hi");
    expect(hiLlm.complete).toHaveBeenCalledWith(expect.objectContaining({ language: "hi" }));
    expect(hiTts.synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: "hi" }));

    const messages = (hiLlm.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0].messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages.some((m) => m.content.includes("cardiologist"))).toBe(true);
    expect(messages.some((m) => m.content.includes("milna"))).toBe(true);

    const events = await callEventRepository.listByCallId(started.callId);
    const changed = events.filter((e) => e.eventType === "LANGUAGE_CHANGED");
    expect(changed).toHaveLength(1);
    expect(changed[0]?.metadata).toMatchObject({ from: "en", to: "hi" });
  });

  it("TC-002 switches HI → EN", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "hi" });

    const hiPipeline = new VoicePipelineService({
      stt: mockStt("Namaste, mujhe milna hai", "hi"),
      llm: mockLlm("Main madad karunga."),
      tts: mockTts(),
      sessions,
    });
    await hiPipeline.runTurn({ audio: new Uint8Array([1]), callId: started.callId });

    const enLlm = mockLlm("Sure, I can help.");
    const enPipeline = new VoicePipelineService({
      stt: mockStt("Hello, I want to book an appointment tomorrow", "en"),
      llm: enLlm,
      tts: mockTts(),
      sessions,
    });
    const turn = await enPipeline.runTurn({
      audio: new Uint8Array([2]),
      callId: started.callId,
    });

    expect(turn.language).toBe("en");
    expect(turn.languageChanged).toBe(true);
    expect(enLlm.complete).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));

    const events = await callEventRepository.listByCallId(started.callId);
    const changed = events.filter((e) => e.eventType === "LANGUAGE_CHANGED");
    expect(changed.at(-1)?.metadata).toMatchObject({ from: "hi", to: "en" });
  });

  it("TC-003 does not emit LANGUAGE_CHANGED for consecutive English turns", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });

    for (const text of [
      "Hello, I need an appointment",
      "Please book a doctor tomorrow morning",
    ]) {
      const pipeline = new VoicePipelineService({
        stt: mockStt(text, "en"),
        llm: mockLlm("I can help."),
        tts: mockTts(),
        sessions,
      });
      const turn = await pipeline.runTurn({
        audio: new Uint8Array([1, 2]),
        callId: started.callId,
      });
      expect(turn.language).toBe("en");
      expect(turn.languageChanged).toBe(false);
    }

    const events = await callEventRepository.listByCallId(started.callId);
    expect(events.map((e) => e.eventType)).not.toContain("LANGUAGE_CHANGED");
  });

  it("TC-004 handles Hinglish mid-call on one engine without a new session", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });

    await new VoicePipelineService({
      stt: mockStt("I need a cardiologist on Tuesday", "en"),
      llm: mockLlm("What time works?"),
      tts: mockTts(),
      sessions,
    }).runTurn({ audio: new Uint8Array([1]), callId: started.callId });

    const llm = mockLlm("Theek hai, main help karunga.");
    const tts = mockTts();
    const turn = await new VoicePipelineService({
      stt: mockStt("Mujhe appointment book karna hai tomorrow", "en"),
      llm,
      tts,
      sessions,
    }).runTurn({ audio: new Uint8Array([2]), callId: started.callId });

    expect(turn.callId).toBe(started.callId);
    expect(turn.language).toBe("hinglish");
    expect(turn.languageChanged).toBe(true);
    expect(llm.complete).toHaveBeenCalledWith(expect.objectContaining({ language: "hinglish" }));
    expect(tts.synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: "hinglish" }));

    const messages = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0].messages as Array<{
      content: string;
    }>;
    expect(messages.some((m) => m.content.includes("cardiologist"))).toBe(true);
  });
});
