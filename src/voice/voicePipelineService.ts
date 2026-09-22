import { LlmService, type LlmMessage } from "../ai/llmService";
import {
  ConversationService,
  conversationService as defaultConversationService,
} from "../conversation/conversationService";
import {
  SessionService,
  sessionService as defaultSessionService,
} from "../services/sessionService";
import { logger } from "../utils/logger";
import { ExternalServiceError, ValidationError } from "../utils/errors";
import { SttService } from "./sttService";
import { TtsService } from "./ttsService";

export type VoiceTurnRequest = {
  audio: ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
  /** Resume an in-memory conversation turn buffer. Prefer callId (KAN-15) when available. */
  conversationId?: string;
  /** Durable session id (= calls.id) from POST /api/sessions. */
  callId?: string;
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
  callId?: string;
  sessionId?: string;
  currentState?: string;
  action?: "continue" | "waited" | "resumed";
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
  sessions?: SessionService;
};

/**
 * Orchestrates one browser voice turn: STT → LLM → TTS (KAN-14).
 * When `callId` is set, uses SessionService for durable state + context (KAN-15).
 * No telephony. Failures are isolated per stage; TTS failure still returns text.
 */
export class VoicePipelineService {
  private readonly stt: SttService;
  private readonly llm: LlmService;
  private readonly tts: TtsService;
  private readonly conversation: ConversationService;
  private readonly sessions: SessionService;

  constructor(options: VoicePipelineServiceOptions = {}) {
    this.stt = options.stt ?? new SttService();
    this.llm = options.llm ?? new LlmService();
    this.tts = options.tts ?? new TtsService();
    this.conversation = options.conversation ?? defaultConversationService;
    this.sessions = options.sessions ?? defaultSessionService;
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

    const callId = request.callId?.trim();
    if (callId) {
      return this.runTurnWithSession(callId, transcript, request);
    }

    return this.runTurnInMemory(transcript, request);
  }

  private async runTurnWithSession(
    callId: string,
    transcript: string,
    request: VoiceTurnRequest,
  ): Promise<VoiceTurnResponse> {
    const utterance = await this.sessions.handleUserUtterance(callId, transcript);

    let replyText: string;
    if (utterance.action === "waited" && utterance.agentReply) {
      replyText = utterance.agentReply;
    } else {
      const extraMessages = request.messages ?? [];
      const messages: LlmMessage[] = [
        ...utterance.messages.filter((m) => m.role !== "system"),
        ...extraMessages,
      ];

      try {
        const llmResult = await this.llm.complete({
          messages,
          includeSystemPrompt: true,
          enableTools: false,
        });
        replyText = llmResult.text.trim();
      } catch (error) {
        logger.error(
          { err: error, stage: "llm", callId, conversationId: utterance.conversationId },
          "Voice pipeline LLM failed",
        );
        throw error;
      }

      if (!replyText) {
        throw new ExternalServiceError("llm", "LLM returned an empty reply");
      }

      await this.sessions.appendTurn(callId, { role: "assistant", content: replyText });
    }

    const response: VoiceTurnResponse = {
      transcript,
      replyText,
      conversationId: utterance.conversationId,
      callId,
      sessionId: request.sessionId,
      currentState: utterance.currentState,
      action: utterance.action,
    };

    return this.attachTts(response, replyText, request.voice, utterance.conversationId);
  }

  private async runTurnInMemory(
    transcript: string,
    request: VoiceTurnRequest,
  ): Promise<VoiceTurnResponse> {
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
      action: "continue",
    };

    return this.attachTts(response, replyText, request.voice, conversation.id);
  }

  private async attachTts(
    response: VoiceTurnResponse,
    replyText: string,
    voice: string | undefined,
    conversationId: string,
  ): Promise<VoiceTurnResponse> {
    try {
      const ttsResult = await this.tts.synthesize({ text: replyText, voice });
      response.audioBase64 = Buffer.from(ttsResult.audio).toString("base64");
      response.mimeType = ttsResult.mimeType;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: string }).code)
          : "EXTERNAL_SERVICE_UNAVAILABLE";
      const message =
        error instanceof Error ? error.message : "Text-to-speech failed after LLM reply";
      const service = error instanceof ExternalServiceError ? error.service : "tts";

      logger.error(
        { err: error, stage: "tts", conversationId },
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
