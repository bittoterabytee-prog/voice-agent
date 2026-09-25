import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/ai/llmService";
import { ConversationService } from "../src/conversation/conversationService";
import { logger } from "../src/utils/logger";
import {
  LanguageDetectionService,
  type LanguageDetectionResult,
} from "../src/voice/languageDetectionService";
import { SttService } from "../src/voice/sttService";
import { TtsService } from "../src/voice/ttsService";
import { VoicePipelineService, UNSUPPORTED_LANGUAGE_REPLY, UNCLEAR_SPEECH_REPLY } from "../src/voice/voicePipelineService";

afterEach(() => {
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

function mockTts(): TtsService {
  return {
    synthesize: vi.fn(async () => ({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg" })),
  } as unknown as TtsService;
}

describe("KAN-23 language detection", () => {
  const detector = new LanguageDetectionService();

  it("TC-001 classifies an English utterance as en", () => {
    const result = detector.detect("Hello, I want to book an appointment.");
    expect(result.language).toBe("en");
    expect(result.unclear).toBe(false);
    expect(result.unsupported).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("TC-002 classifies romanized Hindi with an English loanword as hinglish, not English-only", () => {
    const result = detector.detect("Mujhe kal ka appointment chahiye.");
    expect(result.language === "hi" || result.language === "hinglish").toBe(true);
    expect(result.language).not.toBe("en");
    expect(result.unclear).toBe(false);
  });

  it("TC-002 classifies Devanagari and pure romanized Hindi as hi", () => {
    expect(detector.detect("मुझे कल आना है").language).toBe("hi");
    expect(detector.detect("Mujhe kal subah aana hai").language).toBe("hi");
  });

  it("TC-003 keeps a mixed Hinglish utterance as one hinglish result", () => {
    const result = detector.detect(
      "Mujhe doctor ke saath evening mein appointment chahiye, around 6 PM.",
    );
    expect(result).toMatchObject<Partial<LanguageDetectionResult>>({
      language: "hinglish",
      unclear: false,
      unsupported: false,
    });
  });

  it("TC-004 flags empty, nonsense, and unsupported text", () => {
    expect(detector.detect("")).toMatchObject({ unclear: true, language: null });
    expect(detector.detect("   ???  ")).toMatchObject({
      unclear: true,
      unsupported: false,
      language: null,
    });
    expect(detector.detect("asdf")).toMatchObject({ unclear: true, language: null });
    expect(detector.detect("Bonjour je voudrais un rendez vous demain")).toMatchObject({
      unclear: true,
      unsupported: true,
      language: null,
    });
    expect(detector.detect("你好我想预约")).toMatchObject({
      unclear: true,
      unsupported: true,
      language: null,
    });
  });

  it("TC-005 English 'speak in Hindi' requests switch to hi (not unsupported)", () => {
    expect(detector.detect("Speak in Hindi, brother.")).toMatchObject({
      language: "hi",
      unclear: false,
      unsupported: false,
    });
    expect(detector.detect("Can you speak in Hindi, please?")).toMatchObject({
      language: "hi",
      unclear: false,
      unsupported: false,
    });
    expect(detector.detect("Please switch to English")).toMatchObject({
      language: "en",
      unclear: false,
      unsupported: false,
    });
    expect(detector.detect("Talk in Hinglish please")).toMatchObject({
      language: "hinglish",
      unclear: false,
      unsupported: false,
    });
  });

  it("does not mark Latin English with Indian names as unsupported", () => {
    expect(
      detector.detect(
        "I think the last one for Manohar Lal Modi first, let's go for that.",
      ),
    ).toMatchObject({
      language: "en",
      unclear: false,
      unsupported: false,
    });
  });

  it("does not let a provider hint override a clear transcript", () => {
    const hinted = detector.detect("Hello, I want to book an appointment.", {
      providerLanguage: "hi",
    });
    expect(hinted.language).toBe("en");

    const agreed = detector.detect("Hello, I want to book an appointment.", {
      providerLanguage: "en-US",
    });
    const plain = detector.detect("Hello, I want to book an appointment.");
    expect(agreed.confidence).toBeGreaterThan(plain.confidence);
  });

  it("flags out-of-scope provider languages as unsupported (en/hi/hinglish only)", () => {
    expect(
      detector.detect("Hello, I want to book an appointment.", { providerLanguage: "fr" }),
    ).toMatchObject({
      language: null,
      unclear: true,
      unsupported: true,
    });
  });

  it("TC-005 redacts secrets when detection throws and still returns a text reply", async () => {
    const errorSpy = vi.spyOn(logger, "error");
    const llm = mockLlm("I can help with that.");
    const pipeline = new VoicePipelineService({
      stt: mockStt("Hello, I want to book an appointment."),
      llm,
      tts: mockTts(),
      conversation: new ConversationService(),
      languageDetection: {
        detect() {
          throw new Error("detector failed sk-testkey12345678");
        },
      },
    });

    const result = await pipeline.runTurn({
      audio: new Uint8Array([1, 2, 3]),
      sessionId: "browser-lang-1",
    });

    // KAN-30: detection failure → unclear soft fallback (skip LLM).
    expect(result.replyText).toBe(UNCLEAR_SPEECH_REPLY);
    expect(result.languageDetection).toEqual({
      language: null,
      confidence: 0,
      unclear: true,
      unsupported: false,
    });
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain("sk-testkey12345678");
    expect(logged).toContain("[REDACTED]");
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("runs detection after STT and before LLM on a voice turn", async () => {
    const order: string[] = [];
    const stt = {
      transcribe: vi.fn(async () => {
        order.push("stt");
        return { text: "Mujhe doctor ke saath evening mein appointment chahiye" };
      }),
    } as unknown as SttService;
    const llm = {
      complete: vi.fn(async () => {
        order.push("llm");
        return { text: "Sure." };
      }),
    } as unknown as LlmService;

    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts: mockTts(),
      conversation: new ConversationService(),
    });

    const result = await pipeline.runTurn({
      audio: new Uint8Array([4, 5, 6]),
      languageHint: "hi",
    });

    expect(order).toEqual(["stt", "llm"]);
    expect(stt.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ languageHint: "hi" }),
    );
    expect(result.languageDetection?.language).toBe("hinglish");
    expect(result.pipeline?.stages.map((stage) => stage.stage)).toEqual([
      "stt",
      "language",
      "llm",
      "tts",
    ]);
  });

  it("skips LLM and returns a fallback reply for unsupported languages", async () => {
    const stt = {
      transcribe: vi.fn(async () => ({
        text: "Bonjour je voudrais un rendez vous",
        language: "fr",
        supported: false,
      })),
    } as unknown as SttService;
    const llm = {
      complete: vi.fn(async () => ({ text: "should not run" })),
    } as unknown as LlmService;

    const pipeline = new VoicePipelineService({
      stt,
      llm,
      tts: mockTts(),
      conversation: new ConversationService(),
    });

    const result = await pipeline.runTurn({ audio: new Uint8Array([7, 8, 9]) });

    expect(llm.complete).not.toHaveBeenCalled();
    expect(result.languageDetection?.unsupported).toBe(true);
    expect(result.replyText).toBe(UNSUPPORTED_LANGUAGE_REPLY);
    expect(result.pipeline?.stages.map((stage) => stage.stage)).toEqual([
      "stt",
      "language",
      "tts",
    ]);
  });
});
