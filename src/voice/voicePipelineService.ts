import { LlmService, type LlmMessage } from "../ai/llmService";
import {
  ConversationService,
  conversationService as defaultConversationService,
} from "../conversation/conversationService";
import { logger } from "../utils/logger";
import { ExternalServiceError, ValidationError } from "../utils/errors";
import { SttService } from "./sttService";
import { TtsService } from "./ttsService";

export type VoiceTurnRequest = {
  audio: ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
  /** Resume an in-memory conversation turn buffer (KAN-15 will deepen persistence). */
  conversationId?: string;
  /** Extra prior messages merged after conversation history when present. */
  messages?: LlmMessage[];
  voice?: string;
  sessionId?: string;
};

export type VoiceTurnTtsError = {
  code: string;
  message: string;
  service: string;
};

export type VoiceTurnResponse = {
  transcript: string;
  replyText: string;
  conversationId: string;
  sessionId?: string;
  audioBase64?: string;
  mimeType?: string;
  /** Present when LLM succeeded but TTS failed (TC-004). */
  ttsError?: VoiceTurnTtsError;
};

export type VoicePipelineServiceOptions = {
  stt?: SttService;
  llm?: LlmService;
  tts?: TtsService;
  conversation?: ConversationService;
};

/**
 * Orchestrates one browser voice turn: STT → LLM → TTS (KAN-14).
 * No telephony. Failures are isolated per stage; TTS failure still returns text.
 */
export class VoicePipelineService {
  private readonly stt: SttService;
  private readonly llm: LlmService;
  private readonly tts: TtsService;
  private readonly conversation: ConversationService;

  constructor(options: VoicePipelineServiceOptions = {}) {
    this.stt = options.stt ?? new SttService();
    this.llm = options.llm ?? new LlmService();
    this.tts = options.tts ?? new TtsService();
    this.conversation = options.conversation ?? defaultConversationService;
  }

  async runTurn(request: VoiceTurnRequest): Promise<VoiceTurnResponse> {
    const bytes =
      request.audio instanceof Uint8Array ? request.audio : new Uint8Array(request.audio);
    if (bytes.byteLength === 0) {
      throw new ValidationError("Audio payload is empty or invalid");
    }

    let transcript: string;
    try {
      const sttResult = await this.stt.transcribe({
        audio: bytes,
        mimeType: request.mimeType,
        fileName: request.fileName,
      });
      transcript = sttResult.text.trim();
    } catch (error) {
      logger.error({ err: error, stage: "stt" }, "Voice pipeline STT failed");
      throw error;
    }

    if (!transcript) {
      throw new ValidationError("Speech-to-text returned an empty transcript");
    }

    const conversation = this.resolveConversation(request);
    const historyMessages = conversation.turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
    const extraMessages = request.messages ?? [];
    const messages: LlmMessage[] = [
      ...historyMessages,
      ...extraMessages,
      { role: "user", content: transcript },
    ];

    let replyText: string;
    try {
      const llmResult = await this.llm.complete({
        messages,
        includeSystemPrompt: true,
        enableTools: false,
      });
      replyText = llmResult.text.trim();
    } catch (error) {
      logger.error(
        { err: error, stage: "llm", conversationId: conversation.id },
        "Voice pipeline LLM failed",
      );
      throw error;
    }

    if (!replyText) {
      throw new ExternalServiceError("llm", "LLM returned an empty reply");
    }

    this.conversation.appendTurn(conversation.id, { role: "user", content: transcript });
    this.conversation.appendTurn(conversation.id, { role: "assistant", content: replyText });

    const response: VoiceTurnResponse = {
      transcript,
      replyText,
      conversationId: conversation.id,
      sessionId: request.sessionId,
    };

    try {
      const ttsResult = await this.tts.synthesize({ text: replyText, voice: request.voice });
      response.audioBase64 = Buffer.from(ttsResult.audio).toString("base64");
      response.mimeType = ttsResult.mimeType;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: string }).code)
          : "EXTERNAL_SERVICE_UNAVAILABLE";
      const message =
        error instanceof Error ? error.message : "Text-to-speech failed after LLM reply";
      const service =
        error instanceof ExternalServiceError ? error.service : "tts";

      logger.error(
        { err: error, stage: "tts", conversationId: conversation.id },
        "Voice pipeline TTS failed; returning text reply without audio",
      );

      response.ttsError = { code, message, service };
    }

    return response;
  }

  private resolveConversation(request: VoiceTurnRequest) {
    if (request.conversationId) {
      const existing = this.conversation.get(request.conversationId);
      if (!existing) {
        throw new ValidationError(`Conversation not found: ${request.conversationId}`);
      }
      return existing;
    }

    const callId = request.sessionId?.trim() || `pipeline-${Date.now()}`;
    return this.conversation.create(callId);
  }
}

export const voicePipelineService = new VoicePipelineService();
