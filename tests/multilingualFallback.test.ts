import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/ai/llmService";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { conversationService } from "../src/conversation/conversationService";
import { callEventRepository } from "../src/repositories/callEventRepository";
import { SessionService } from "../src/services/sessionService";
import { ExternalServiceError } from "../src/utils/errors";
import { logger } from "../src/utils/logger";
import { redactSecrets } from "../src/utils/redact";
import {
  fallbackReplyFor,
  UNCLEAR_SPEECH_REPLY,
  UNSUPPORTED_LANGUAGE_REPLY,
} from "../src/voice/fallbackMessages";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService } from "../src/voice/voicePipelineService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

function mockStt(text: string, language = "en", supported = true): SttService {
  return {
    transcribe: vi.fn(async () => ({ text, language, supported })),
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

describe("KAN-30 multilingual error & fallback handling", () => {
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

  it("TC-001 returns clarification for unclear speech and keeps the session open", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "hi" });
    const llm = mockLlm("should not run");

    const turn = await new VoicePipelineService({
      stt: mockStt("???", "en"),
      llm,
      tts: mockTts(),
      sessions,
    }).runTurn({ audio: new Uint8Array([1, 2, 3]), callId: started.callId });

    expect(turn.languageDetection?.unclear).toBe(true);
    expect(turn.languageDetection?.unsupported).toBe(false);
    expect(turn.replyText).toBe(fallbackReplyFor("unclear", "hi").replyText);
    expect(turn.language).toBe("hi");
    expect(turn.languageChanged).toBe(false);
    expect(llm.complete).not.toHaveBeenCalled();

    const stillOpen = await sessions.getSession(started.callId);
    expect(stillOpen.language).toBe("hi");
    expect(stillOpen.currentState).not.toBe("ENDED");

    const events = await callEventRepository.listByCallId(started.callId);
    const fallback = events.find(
      (e) => e.eventType === "TOOL_CALLED" && (e.metadata as { kind?: string })?.kind === "language_fallback",
    );
    expect(fallback?.metadata).toMatchObject({
      kind: "language_fallback",
      reason: "unclear",
      replyLanguage: "hi",
    });
  });

  it("TC-002 returns a polite unsupported-language fallback in session language", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });
    const llm = mockLlm("should not run");
    const tts = mockTts();

    const turn = await new VoicePipelineService({
      stt: {
        transcribe: vi.fn(async () => ({
          text: "Bonjour, je voudrais un rendez-vous",
          language: "fr",
          supported: false,
        })),
      } as unknown as SttService,
      llm,
      tts,
      sessions,
    }).runTurn({ audio: new Uint8Array([9, 9, 9]), callId: started.callId });

    expect(turn.languageDetection?.unsupported).toBe(true);
    expect(turn.replyText).toBe(UNSUPPORTED_LANGUAGE_REPLY);
    expect(turn.language).toBe("en");
    expect(llm.complete).not.toHaveBeenCalled();
    expect(tts.synthesize).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));

    const hiSession = await sessions.startSession({ language: "hi" });
    const hiTurn = await new VoicePipelineService({
      stt: {
        transcribe: vi.fn(async () => ({
          text: "Bonjour",
          language: "fr",
          supported: false,
        })),
      } as unknown as SttService,
      llm: mockLlm("nope"),
      tts: mockTts(),
      sessions,
    }).runTurn({ audio: new Uint8Array([1]), callId: hiSession.callId });

    expect(hiTurn.replyText).toBe(fallbackReplyFor("unsupported", "hi").replyText);
    expect(hiTurn.language).toBe("hi");
  });

  it("TC-003 redacts API keys from provider error logs", async () => {
    const secret = "sk-testSecretKey1234567890abcdef";
    expect(redactSecrets(`OpenAI failed with ${secret}`)).not.toContain(secret);
    expect(redactSecrets(`OpenAI failed with ${secret}`)).toContain("[REDACTED]");

    const errorSpy = vi.spyOn(logger, "error");

    await expect(
      new VoicePipelineService({
        stt: {
          transcribe: vi.fn(async () => {
            throw new ExternalServiceError("stt", `Whisper failed: Bearer ${secret}`);
          }),
        } as unknown as SttService,
        llm: mockLlm("no"),
        tts: mockTts(),
      }).runTurn({ audio: new Uint8Array([1, 2]) }),
    ).rejects.toBeInstanceOf(ExternalServiceError);

    const payloads = errorSpy.mock.calls.map((c) => JSON.stringify(c));
    expect(payloads.some((p) => p.includes(secret))).toBe(false);
    expect(payloads.some((p) => p.includes("[REDACTED]"))).toBe(true);
  });

  it("empty STT soft-continues with clarification instead of ending the session", async () => {
    const sessions = new SessionService();
    const started = await sessions.startSession({ language: "en" });
    const llm = mockLlm("no");

    const turn = await new VoicePipelineService({
      stt: mockStt("", "en"),
      llm,
      tts: mockTts(),
      sessions,
    }).runTurn({ audio: new Uint8Array([1]), callId: started.callId });

    expect(turn.replyText).toBe(UNCLEAR_SPEECH_REPLY);
    expect(turn.languageDetection?.unclear).toBe(true);
    expect(llm.complete).not.toHaveBeenCalled();
    await expect(sessions.getSession(started.callId)).resolves.toMatchObject({ language: "en" });
  });
});
