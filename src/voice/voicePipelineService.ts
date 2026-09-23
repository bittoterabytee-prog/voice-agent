import { LlmService, type LlmMessage } from "../ai/llmService";
import {
  ConversationService,
  conversationService as defaultConversationService,
} from "../conversation/conversationService";
import {
  callEventRepository,
  type CallEventRepository,
} from "../repositories/callEventRepository";
import {
  SessionService,
  sessionService as defaultSessionService,
} from "../services/sessionService";
import { ExternalServiceError, ValidationError } from "../utils/errors";
import {
  estimateLlmCostUsd,
  estimateSttCostUsd,
  estimateTtsCostUsd,
  sumTurnCost,
  type StageUsageEstimate,
  type TurnCostEstimate,
} from "../utils/openaiCost";
import {
  createPipelineTrace,
  createRequestId,
  logPipelineStage,
  withStageTiming,
  type PipelineLogContext,
  type PipelineTrace,
} from "../utils/pipelineLog";
import { redactSecrets } from "../utils/redact";
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
  /** Correlation id from HTTP request logger (KAN-18). */
  requestId?: string;
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
  requestId?: string;
  currentState?: string;
  action?: "continue" | "waited" | "resumed";
  audioBase64?: string;
  mimeType?: string;
  /** Present when LLM succeeded but TTS failed (TC-004). */
  ttsError?: VoiceTurnTtsError;
  /** Stage timings for UI observability (KAN-18). */
  pipeline?: PipelineTrace;
  /** Estimated OpenAI spend for this turn (KAN-18). */
  cost?: TurnCostEstimate;
};

export type VoicePipelineServiceOptions = {
  stt?: SttService;
  llm?: LlmService;
  tts?: TtsService;
  conversation?: ConversationService;
  sessions?: SessionService;
  events?: CallEventRepository;
};

/**
 * Orchestrates one browser voice turn: STT → LLM → TTS (KAN-14).
 * When `callId` is set, uses SessionService for durable state + context (KAN-15).
 * KAN-18: structured stage logs + failure call_events; TTS failure still returns text.
 */
export class VoicePipelineService {
  private readonly stt: SttService;
  private readonly llm: LlmService;
  private readonly tts: TtsService;
  private readonly conversation: ConversationService;
  private readonly sessions: SessionService;
  private readonly events: CallEventRepository;

  constructor(options: VoicePipelineServiceOptions = {}) {
    this.stt = options.stt ?? new SttService();
    this.llm = options.llm ?? new LlmService();
    this.tts = options.tts ?? new TtsService();
    this.conversation = options.conversation ?? defaultConversationService;
    this.sessions = options.sessions ?? defaultSessionService;
    this.events = options.events ?? callEventRepository;
  }

  async runTurn(request: VoiceTurnRequest): Promise<VoiceTurnResponse> {
    const requestId = createRequestId(request.requestId);
    const trace = createPipelineTrace(requestId);
    const baseCtx: PipelineLogContext = {
      requestId,
      callId: request.callId?.trim() || undefined,
      conversationId: request.conversationId?.trim() || undefined,
      sessionId: request.sessionId,
    };
    const turnStarted = Date.now();

    logPipelineStage("info", "Voice pipeline turn start", {
      ...baseCtx,
      stage: "turn",
      outcome: "start",
    });

    try {
      const bytes =
        request.audio instanceof Uint8Array ? request.audio : new Uint8Array(request.audio);
      if (bytes.byteLength === 0) {
        throw new ValidationError("Audio payload is empty or invalid");
      }

      const costBreakdown: StageUsageEstimate[] = [];
      costBreakdown.push(
        estimateSttCostUsd({ audioBytes: bytes.byteLength, mimeType: request.mimeType }),
      );

      let transcript: string;
      try {
        const { result: sttResult } = await withStageTiming(
          { ...baseCtx, stage: "stt" },
          () =>
            this.stt.transcribe({
              audio: bytes,
              mimeType: request.mimeType,
              fileName: request.fileName,
            }),
          trace,
        );
        transcript = sttResult.text.trim();
      } catch (error) {
        await this.recordPipelineFailure(baseCtx, "stt", error);
        throw error;
      }

      if (!transcript) {
        throw new ValidationError("Speech-to-text returned an empty transcript");
      }

      const callId = request.callId?.trim();
      const response = callId
        ? await this.runTurnWithSession(callId, transcript, request, baseCtx, trace, costBreakdown)
        : await this.runTurnInMemory(transcript, request, baseCtx, trace, costBreakdown);

      response.requestId = requestId;
      response.pipeline = trace.toJSON();
      response.cost = sumTurnCost(costBreakdown);

      if (response.callId) {
        await this.persistTurnUsage(response.callId, response.cost, requestId);
      }

      logPipelineStage("info", "Voice pipeline turn success", {
        ...baseCtx,
        callId: response.callId ?? baseCtx.callId,
        conversationId: response.conversationId,
        stage: "turn",
        outcome: "success",
        durationMs: Date.now() - turnStarted,
        softFail: Boolean(response.ttsError),
        estimatedUsd: response.cost.estimatedUsd,
      });

      return response;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: string }).code)
          : "INTERNAL_ERROR";
      logPipelineStage("error", "Voice pipeline turn failed", {
        ...baseCtx,
        stage: "turn",
        outcome: "failure",
        durationMs: Date.now() - turnStarted,
        code,
        err: error,
      });
      throw error;
    }
  }

  private async runTurnWithSession(
    callId: string,
    transcript: string,
    request: VoiceTurnRequest,
    baseCtx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
  ): Promise<VoiceTurnResponse> {
    const utterance = await this.sessions.handleUserUtterance(callId, transcript);
    const ctx: PipelineLogContext = {
      ...baseCtx,
      callId,
      conversationId: utterance.conversationId,
    };

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
        const { result: llmResult } = await withStageTiming(
          { ...ctx, stage: "llm" },
          () =>
            this.llm.complete({
              messages,
              includeSystemPrompt: true,
              enableTools: false,
            }),
          trace,
        );
        replyText = llmResult.text.trim();
        costBreakdown.push(
          estimateLlmCostUsd({
            promptTokens: llmResult.usage?.promptTokens,
            completionTokens: llmResult.usage?.completionTokens,
          }),
        );
      } catch (error) {
        await this.recordPipelineFailure(ctx, "llm", error);
        throw error;
      }

      if (!replyText) {
        const emptyError = new ExternalServiceError("llm", "LLM returned an empty reply");
        await this.recordPipelineFailure(ctx, "llm", emptyError);
        throw emptyError;
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

    return this.attachTts(response, replyText, request.voice, ctx, trace, costBreakdown);
  }

  private async runTurnInMemory(
    transcript: string,
    request: VoiceTurnRequest,
    baseCtx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
  ): Promise<VoiceTurnResponse> {
    const conversation = this.resolveConversation(request);
    const ctx: PipelineLogContext = {
      ...baseCtx,
      conversationId: conversation.id,
    };

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
      const { result: llmResult } = await withStageTiming(
        { ...ctx, stage: "llm" },
        () =>
          this.llm.complete({
            messages,
            includeSystemPrompt: true,
            enableTools: false,
          }),
        trace,
      );
      replyText = llmResult.text.trim();
      costBreakdown.push(
        estimateLlmCostUsd({
          promptTokens: llmResult.usage?.promptTokens,
          completionTokens: llmResult.usage?.completionTokens,
        }),
      );
    } catch (error) {
      await this.recordPipelineFailure(ctx, "llm", error);
      throw error;
    }

    if (!replyText) {
      const emptyError = new ExternalServiceError("llm", "LLM returned an empty reply");
      await this.recordPipelineFailure(ctx, "llm", emptyError);
      throw emptyError;
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

    return this.attachTts(response, replyText, request.voice, ctx, trace, costBreakdown);
  }

  private async attachTts(
    response: VoiceTurnResponse,
    replyText: string,
    voice: string | undefined,
    ctx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
  ): Promise<VoiceTurnResponse> {
    costBreakdown.push(estimateTtsCostUsd({ text: replyText }));

    try {
      const { result: ttsResult } = await withStageTiming(
        { ...ctx, stage: "tts" },
        () => this.tts.synthesize({ text: replyText, voice }),
        trace,
      );
      response.audioBase64 = Buffer.from(ttsResult.audio).toString("base64");
      response.mimeType = ttsResult.mimeType;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: string }).code)
          : "EXTERNAL_SERVICE_UNAVAILABLE";
      const rawMessage =
        error instanceof Error ? error.message : "Text-to-speech failed after LLM reply";
      const message = redactSecrets(rawMessage);
      const service = error instanceof ExternalServiceError ? error.service : "tts";

      const last = trace.stages[trace.stages.length - 1];
      if (last?.stage === "tts" && last.outcome === "failure") {
        last.softFail = true;
      }

      logPipelineStage("error", "Voice pipeline TTS failed; returning text reply without audio", {
        ...ctx,
        stage: "tts",
        outcome: "failure",
        softFail: true,
        code,
        err: error,
      });

      await this.recordPipelineFailure(ctx, "tts", error, true);

      response.ttsError = { code, message, service };
    }

    return response;
  }

  private async persistTurnUsage(
    callId: string,
    cost: TurnCostEstimate,
    requestId: string,
  ): Promise<void> {
    try {
      await this.events.create({
        callId,
        eventType: "TOOL_CALLED",
        metadata: {
          kind: "openai_usage",
          requestId,
          currency: cost.currency,
          estimatedUsd: cost.estimatedUsd,
          breakdown: cost.breakdown,
          note: cost.note,
        },
      });
    } catch (persistError) {
      logPipelineStage("warn", "Failed to persist openai_usage call_event", {
        callId,
        requestId,
        stage: "turn",
        outcome: "failure",
        err: persistError,
      });
    }
  }

  private async recordPipelineFailure(
    ctx: PipelineLogContext,
    stage: "stt" | "llm" | "tts",
    error: unknown,
    softFail = false,
  ): Promise<void> {
    const callId = ctx.callId?.trim();
    if (!callId) {
      return;
    }

    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: string }).code)
        : "INTERNAL_ERROR";
    const rawMessage = error instanceof Error ? error.message : "Voice pipeline stage failed";
    const service =
      error instanceof ExternalServiceError
        ? error.service
        : stage === "stt"
          ? "stt"
          : stage === "llm"
            ? "llm"
            : "tts";

    try {
      await this.events.create({
        callId,
        eventType: "TOOL_FAILED",
        metadata: {
          kind: "voice_pipeline",
          stage,
          service,
          code: redactSecrets(code),
          message: redactSecrets(rawMessage),
          softFail,
          requestId: ctx.requestId,
          conversationId: ctx.conversationId,
        },
      });
    } catch (persistError) {
      logPipelineStage("warn", "Failed to persist voice pipeline failure call_event", {
        ...ctx,
        stage,
        outcome: "failure",
        err: persistError,
      });
    }
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
