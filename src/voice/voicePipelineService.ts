import { LlmService, type LlmMessage } from "../ai/llmService";
import { resolveReplyLanguage } from "../ai/prompts";
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
import {
  fallbackReplyFor,
  UNSUPPORTED_LANGUAGE_REPLY,
  type FallbackReason,
} from "./fallbackMessages";
import {
  languageDetectionService,
  type LanguageDetectionResult,
  type LanguageDetectionService,
} from "./languageDetectionService";
import { SttService } from "./sttService";
import { TtsService } from "./ttsService";

export { UNSUPPORTED_LANGUAGE_REPLY, UNCLEAR_SPEECH_REPLY } from "./fallbackMessages";
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
  /** Optional STT / detection language hint (en | hi | hinglish). Session language used when omitted (KAN-23, KAN-24). */
  languageHint?: string;
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
  /** Utterance language for the single conversation engine (KAN-23). */
  languageDetection?: LanguageDetectionResult;
  /**
   * Durable session language preference (en | hi | hinglish) when `callId` is set (KAN-28).
   * Updated from clear detection results; unchanged on unclear/unsupported.
   */
  language?: string;
  /**
   * True when this turn changed the durable session language (KAN-27).
   * Only set when `callId` is present.
   */
  languageChanged?: boolean;
};

export type VoicePipelineServiceOptions = {
  stt?: SttService;
  llm?: LlmService;
  tts?: TtsService;
  conversation?: ConversationService;
  sessions?: SessionService;
  events?: CallEventRepository;
  languageDetection?: LanguageDetectionService;
};

/**
 * Orchestrates one browser voice turn: STT → language detection → LLM → TTS (KAN-14, KAN-23).
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
  private readonly languageDetection: LanguageDetectionService;

  constructor(options: VoicePipelineServiceOptions = {}) {
    this.stt = options.stt ?? new SttService();
    this.llm = options.llm ?? new LlmService();
    this.tts = options.tts ?? new TtsService();
    this.conversation = options.conversation ?? defaultConversationService;
    this.sessions = options.sessions ?? defaultSessionService;
    this.events = options.events ?? callEventRepository;
    this.languageDetection = options.languageDetection ?? languageDetectionService;
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
      let sttLanguage: string | undefined;
      let sttSupported = true;
      try {
        const languageHint = await this.resolveSttLanguageHint(request);
        const { result: sttResult } = await withStageTiming(
          { ...baseCtx, stage: "stt" },
          () =>
            this.stt.transcribe({
              audio: bytes,
              mimeType: request.mimeType,
              fileName: request.fileName,
              languageHint,
            }),
          trace,
        );
        transcript = sttResult.text.trim();
        sttLanguage = sttResult.language;
        sttSupported = sttResult.supported !== false;
      } catch (error) {
        await this.recordPipelineFailure(baseCtx, "stt", error);
        throw error;
      }

      if (!transcript) {
        // KAN-30: empty STT soft-continues with clarification (session stays open).
        const emptyDetection: LanguageDetectionResult = {
          language: null,
          confidence: 0,
          unclear: true,
          unsupported: false,
        };
        const response = await this.runLanguageFallbackTurn(
          "",
          emptyDetection,
          "unclear",
          request,
          baseCtx,
          trace,
          costBreakdown,
        );
        return this.finalizeFallbackResponse(response, requestId, trace, costBreakdown, turnStarted, baseCtx, "unclear");
      }

      let languageDetection = this.detectLanguage(
        transcript,
        sttLanguage ?? request.languageHint,
        baseCtx,
        trace,
      );

      // Trust a clear in-scope transcript (incl. explicit "speak in Hindi") over Whisper's
      // out-of-scope language tag — otherwise English switch requests become false unsupported.
      if (
        !sttSupported &&
        !languageDetection.unsupported &&
        !(languageDetection.language && !languageDetection.unclear)
      ) {
        languageDetection = {
          language: null,
          confidence: 0,
          unclear: true,
          unsupported: true,
        };
      }

      if (languageDetection.unsupported || languageDetection.unclear) {
        const reason: FallbackReason = languageDetection.unsupported ? "unsupported" : "unclear";
        const response = await this.runLanguageFallbackTurn(
          transcript,
          languageDetection,
          reason,
          request,
          baseCtx,
          trace,
          costBreakdown,
        );
        return this.finalizeFallbackResponse(response, requestId, trace, costBreakdown, turnStarted, baseCtx, reason);
      }

      const callId = request.callId?.trim();
      let sessionLanguage: string | undefined;
      let languageChanged = false;
      if (callId) {
        const persist = await this.persistDetectedSessionLanguage(callId, languageDetection);
        sessionLanguage = persist.language;
        languageChanged = persist.changed;
      }

      const replyLanguage = this.resolveTurnReplyLanguage(languageDetection, sessionLanguage);

      const response = callId
        ? await this.runTurnWithSession(
            callId,
            transcript,
            request,
            baseCtx,
            trace,
            costBreakdown,
            replyLanguage,
          )
        : await this.runTurnInMemory(
            transcript,
            request,
            baseCtx,
            trace,
            costBreakdown,
            replyLanguage,
          );

      response.languageDetection = languageDetection;
      if (sessionLanguage) {
        response.language = sessionLanguage;
      } else if (!response.language) {
        response.language = replyLanguage;
      }
      if (callId) {
        response.languageChanged = languageChanged;
      }
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

  private async finalizeFallbackResponse(
    response: VoiceTurnResponse,
    requestId: string,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
    turnStarted: number,
    baseCtx: PipelineLogContext,
    reason: FallbackReason,
  ): Promise<VoiceTurnResponse> {
    response.requestId = requestId;
    response.pipeline = trace.toJSON();
    response.cost = sumTurnCost(costBreakdown);
    if (response.callId) {
      await this.persistTurnUsage(response.callId, response.cost, requestId);
      if (!response.language) {
        response.language = await this.readSessionLanguage(response.callId);
      }
    }
    logPipelineStage("info", "Voice pipeline turn success (language fallback)", {
      ...baseCtx,
      callId: response.callId ?? baseCtx.callId,
      conversationId: response.conversationId,
      stage: "turn",
      outcome: "success",
      durationMs: Date.now() - turnStarted,
      softFail: Boolean(response.ttsError),
      estimatedUsd: response.cost.estimatedUsd,
      fallbackReason: reason,
    });
    return response;
  }

  /**
   * Soft-continue for unclear / unsupported speech (KAN-30). Skips LLM; TTS in session language.
   */
  private async runLanguageFallbackTurn(
    transcript: string,
    languageDetection: LanguageDetectionResult,
    reason: FallbackReason,
    request: VoiceTurnRequest,
    baseCtx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
  ): Promise<VoiceTurnResponse> {
    const callId = request.callId?.trim();
    const sessionLanguage = callId ? await this.readSessionLanguage(callId) : undefined;
    const { language: replyLanguage, replyText } = fallbackReplyFor(reason, sessionLanguage);

    logPipelineStage("info", "Voice pipeline language fallback", {
      ...baseCtx,
      callId,
      stage: "language",
      outcome: "success",
      softFail: true,
      fallbackReason: reason,
      replyLanguage,
    });

    if (callId) {
      try {
        await this.events.create({
          callId,
          eventType: "TOOL_CALLED",
          metadata: {
            kind: "language_fallback",
            reason,
            replyLanguage,
            requestId: baseCtx.requestId,
          },
        });
      } catch {
        // Logging must not break the turn.
      }

      try {
        const utterance = await this.sessions.handleUserUtterance(
          callId,
          transcript.length > 0 ? transcript : "(inaudible)",
        );
        await this.sessions.appendTurn(callId, { role: "assistant", content: replyText });
        const response: VoiceTurnResponse = {
          transcript,
          replyText,
          conversationId: utterance.conversationId,
          callId,
          sessionId: request.sessionId,
          currentState: utterance.currentState,
          action: utterance.action,
          languageDetection,
          language: utterance.language ?? sessionLanguage ?? replyLanguage,
          languageChanged: false,
        };
        return this.attachTts(
          response,
          replyText,
          request.voice,
          replyLanguage,
          baseCtx,
          trace,
          costBreakdown,
        );
      } catch {
        // Fall through to in-memory path if session is unavailable.
      }
    }

    const conversation = this.resolveConversation(request);
    this.conversation.appendTurn(conversation.id, {
      role: "user",
      content: transcript.length > 0 ? transcript : "(inaudible)",
    });
    this.conversation.appendTurn(conversation.id, { role: "assistant", content: replyText });

    const response: VoiceTurnResponse = {
      transcript,
      replyText,
      conversationId: conversation.id,
      sessionId: request.sessionId,
      languageDetection,
      language: replyLanguage,
    };
    return this.attachTts(
      response,
      replyText,
      request.voice,
      replyLanguage,
      { ...baseCtx, conversationId: conversation.id },
      trace,
      costBreakdown,
    );
  }

  /**
   * Prefer clear detection language; otherwise session preference; else en (KAN-25).
   */
  private resolveTurnReplyLanguage(
    detection: LanguageDetectionResult,
    sessionLanguage: string | undefined,
  ): string {
    if (detection.language && !detection.unclear && !detection.unsupported) {
      return resolveReplyLanguage(detection.language);
    }
    return resolveReplyLanguage(sessionLanguage);
  }

  private async resolveSttLanguageHint(request: VoiceTurnRequest): Promise<string | undefined> {
    const fromRequest = request.languageHint?.trim();
    if (fromRequest) {
      return fromRequest;
    }

    const callId = request.callId?.trim();
    if (!callId) {
      return undefined;
    }

    return this.readSessionLanguage(callId);
  }

  /**
   * When detection is clear (en|hi|hinglish), persist on the session and return the preference.
   * Unclear / unsupported leave the prior session language unchanged (KAN-28).
   * `changed` is true only when the durable preference actually switched (KAN-27).
   */
  private async persistDetectedSessionLanguage(
    callId: string,
    detection: LanguageDetectionResult,
  ): Promise<{ language?: string; changed: boolean }> {
    const previous = await this.readSessionLanguage(callId);

    if (detection.language && !detection.unclear && !detection.unsupported) {
      try {
        const updated = await this.sessions.updateLanguage(callId, detection.language);
        const language = updated.language;
        const changed = Boolean(previous && language && previous !== language);
        if (changed) {
          logPipelineStage("info", "Voice pipeline language switched", {
            callId,
            stage: "language",
            outcome: "success",
            from: previous,
            to: language,
          });
        }
        return { language, changed };
      } catch {
        return { language: previous, changed: false };
      }
    }

    return { language: previous, changed: false };
  }

  private async readSessionLanguage(callId: string): Promise<string | undefined> {
    try {
      const session = await this.sessions.getSession(callId);
      const fromSession = session.language?.trim();
      return fromSession || undefined;
    } catch {
      return undefined;
    }
  }

  private detectLanguage(
    transcript: string,
    languageHint: string | undefined,
    ctx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
  ): LanguageDetectionResult {
    const started = Date.now();
    try {
      const result = this.languageDetection.detect(transcript, {
        providerLanguage: languageHint,
      });
      const durationMs = Date.now() - started;
      logPipelineStage("info", "Voice pipeline language success", {
        ...ctx,
        stage: "language",
        outcome: "success",
        durationMs,
        detectedLanguage: result.language,
        confidence: result.confidence,
        unclear: result.unclear,
        unsupported: result.unsupported,
      });
      trace.record({ stage: "language", outcome: "success", durationMs });
      return result;
    } catch (error) {
      const durationMs = Date.now() - started;
      const code = "LANGUAGE_DETECTION_FAILED";
      logPipelineStage("error", "Voice pipeline language failed; continuing with unclear", {
        ...ctx,
        stage: "language",
        outcome: "failure",
        durationMs,
        code,
        err: error,
      });
      trace.record({
        stage: "language",
        outcome: "failure",
        durationMs,
        code,
      });
      return {
        language: null,
        confidence: 0,
        unclear: true,
        unsupported: false,
      };
    }
  }

  private async runTurnWithSession(
    callId: string,
    transcript: string,
    request: VoiceTurnRequest,
    baseCtx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
    replyLanguage: string,
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
              language: replyLanguage,
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
      language: utterance.language,
    };

    return this.attachTts(response, replyText, request.voice, replyLanguage, ctx, trace, costBreakdown);
  }

  private async runTurnInMemory(
    transcript: string,
    request: VoiceTurnRequest,
    baseCtx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
    replyLanguage: string,
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
            language: replyLanguage,
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

    return this.attachTts(response, replyText, request.voice, replyLanguage, ctx, trace, costBreakdown);
  }

  private async attachTts(
    response: VoiceTurnResponse,
    replyText: string,
    voice: string | undefined,
    language: string | undefined,
    ctx: PipelineLogContext,
    trace: ReturnType<typeof createPipelineTrace>,
    costBreakdown: StageUsageEstimate[],
  ): Promise<VoiceTurnResponse> {
    costBreakdown.push(estimateTtsCostUsd({ text: replyText }));

    try {
      const { result: ttsResult } = await withStageTiming(
        { ...ctx, stage: "tts" },
        () => this.tts.synthesize({ text: replyText, voice, language }),
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
