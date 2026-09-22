import {
  ConversationService,
  conversationService as defaultConversationService,
  type ConversationTurn,
} from "../conversation/conversationService";
import { isReturnIntent, isWaitIntent } from "../conversation/waitIntent";
import type { Call } from "../models/call";
import type { ConversationStateName } from "../models/enums";
import type { ConversationStateRecord } from "../models/conversationState";
import { callEventRepository, type CallEventRepository } from "../repositories/callEventRepository";
import { callRepository, type CallRepository } from "../repositories/callRepository";
import {
  conversationStateRepository,
  type ConversationStateRepository,
} from "../repositories/conversationStateRepository";
import { NotFoundError, ValidationError } from "../utils/errors";

export type SessionMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type SessionSnapshot = {
  callId: string;
  conversationId: string;
  callerNumber: string;
  language: string;
  callStatus: Call["status"];
  currentState: ConversationStateName;
  intent: string | null;
  turns: Array<{ role: ConversationTurn["role"]; content: string; createdAt: string }>;
  messages: SessionMessage[];
};

export type HandleUtteranceResult = SessionSnapshot & {
  action: "continue" | "waited" | "resumed";
  /** Suggested agent reply when action is waited (no LLM required). */
  agentReply?: string;
};

export type StartSessionInput = {
  callerNumber?: string;
  language?: string;
};

export type AppendTurnInput = {
  role: "user" | "assistant" | "system";
  content: string;
  intent?: string | null;
};

export type SessionServiceDeps = {
  calls?: CallRepository;
  states?: ConversationStateRepository;
  events?: CallEventRepository;
  conversations?: ConversationService;
};

const DEFAULT_WAIT_REPLY =
  "Of course — take your time. I will wait here until you are ready to continue.";
const DEFAULT_RESUME_HINT = "Welcome back — shall we continue where we left off?";

/**
 * Conversation session lifecycle: durable call + conversation_states + call_events,
 * with in-memory turn buffer (rehydratable from speech events) for LLM context (KAN-15).
 */
export class SessionService {
  private readonly calls: CallRepository;
  private readonly states: ConversationStateRepository;
  private readonly events: CallEventRepository;
  private readonly conversations: ConversationService;

  constructor(deps: SessionServiceDeps = {}) {
    this.calls = deps.calls ?? callRepository;
    this.states = deps.states ?? conversationStateRepository;
    this.events = deps.events ?? callEventRepository;
    this.conversations = deps.conversations ?? defaultConversationService;
  }

  async startSession(input: StartSessionInput = {}): Promise<SessionSnapshot> {
    const language = (input.language?.trim() || "en").toLowerCase();
    const callerNumber = input.callerNumber?.trim() || "browser";

    const call = await this.calls.create({
      callerNumber,
      language,
      status: "ACTIVE",
    });

    const state = await this.states.upsert({
      callId: call.id,
      currentState: "ACTIVE_CONVERSATION",
      language,
      intent: null,
    });

    await this.events.create({
      callId: call.id,
      eventType: "CALL_STARTED",
      metadata: { language, callerNumber },
    });

    const conversation = this.conversations.create(call.id);
    return this.toSnapshot(call, state, conversation.id, conversation.turns);
  }

  async getSession(callId: string): Promise<SessionSnapshot> {
    const { call, state, conversation } = await this.loadSession(callId);
    return this.toSnapshot(call, state, conversation.id, conversation.turns);
  }

  async appendTurn(callId: string, input: AppendTurnInput): Promise<SessionSnapshot> {
    const content = input.content.trim();
    if (!content) {
      throw new ValidationError("content is required");
    }

    const { call, state, conversation } = await this.loadSession(callId);
    this.assertNotCompleted(state);

    this.conversations.appendTurn(conversation.id, {
      role: input.role,
      content,
    });

    if (input.role === "user") {
      await this.events.create({
        callId,
        eventType: "USER_SPEECH",
        metadata: { text: content },
      });
    } else if (input.role === "assistant") {
      await this.events.create({
        callId,
        eventType: "AGENT_RESPONSE",
        metadata: { text: content },
      });
    }

    let nextState = state;
    if (input.intent !== undefined) {
      nextState = await this.states.upsert({
        callId,
        currentState: state.currentState,
        language: state.language,
        intent: input.intent,
      });
    }

    const updated = this.conversations.get(conversation.id)!;
    return this.toSnapshot(call, nextState, conversation.id, updated.turns);
  }

  /**
   * Process a user utterance: retain context, auto wait/resume transitions, emit events.
   */
  async handleUserUtterance(callId: string, text: string): Promise<HandleUtteranceResult> {
    const content = text.trim();
    if (!content) {
      throw new ValidationError("text is required");
    }

    const { state } = await this.loadSession(callId);
    this.assertNotCompleted(state);

    if (state.currentState === "WAITING_FOR_USER" || state.currentState === "USER_REQUESTED_WAIT") {
      const resumed = await this.resumeFromWait(callId);
      const withTurn = await this.appendTurn(callId, { role: "user", content });
      return {
        ...withTurn,
        action: "resumed",
        agentReply: DEFAULT_RESUME_HINT,
        currentState: resumed.currentState,
      };
    }

    if (state.currentState === "ACTIVE_CONVERSATION" && isWaitIntent(content)) {
      await this.appendTurn(callId, { role: "user", content });
      const waited = await this.requestWait(callId);
      const withReply = await this.appendTurn(callId, {
        role: "assistant",
        content: DEFAULT_WAIT_REPLY,
      });
      return {
        ...withReply,
        action: "waited",
        agentReply: DEFAULT_WAIT_REPLY,
        currentState: waited.currentState,
      };
    }

    // Contextual return while still ACTIVE (e.g. "I'm back") — treat as continue unless waiting.
    if (isReturnIntent(content) && state.currentState === "CALLER_RETURNED") {
      const activated = await this.states.upsert({
        callId,
        currentState: "ACTIVE_CONVERSATION",
        language: state.language,
        intent: state.intent,
      });
      const withTurn = await this.appendTurn(callId, { role: "user", content });
      return {
        ...withTurn,
        action: "resumed",
        currentState: activated.currentState,
      };
    }

    const withTurn = await this.appendTurn(callId, { role: "user", content });
    return { ...withTurn, action: "continue" };
  }

  async requestWait(callId: string): Promise<SessionSnapshot> {
    const { call, state, conversation } = await this.loadSession(callId);
    this.assertNotCompleted(state);

    if (state.currentState === "WAITING_FOR_USER") {
      return this.toSnapshot(call, state, conversation.id, conversation.turns);
    }

    if (
      state.currentState !== "ACTIVE_CONVERSATION" &&
      state.currentState !== "CALLER_RETURNED"
    ) {
      throw new ValidationError(
        `Cannot start wait from conversation state ${state.currentState}`,
      );
    }

    await this.states.upsert({
      callId,
      currentState: "USER_REQUESTED_WAIT",
      language: state.language,
      intent: state.intent,
    });

    await this.events.create({
      callId,
      eventType: "WAIT_STARTED",
      metadata: {},
    });

    const waiting = await this.states.upsert({
      callId,
      currentState: "WAITING_FOR_USER",
      language: state.language,
      intent: state.intent,
    });

    return this.toSnapshot(call, waiting, conversation.id, conversation.turns);
  }

  async resumeFromWait(callId: string): Promise<SessionSnapshot> {
    const { call, state, conversation } = await this.loadSession(callId);
    this.assertNotCompleted(state);

    if (state.currentState === "ACTIVE_CONVERSATION") {
      return this.toSnapshot(call, state, conversation.id, conversation.turns);
    }

    if (
      state.currentState !== "WAITING_FOR_USER" &&
      state.currentState !== "USER_REQUESTED_WAIT"
    ) {
      throw new ValidationError(
        `Cannot resume from conversation state ${state.currentState}`,
      );
    }

    await this.states.upsert({
      callId,
      currentState: "CALLER_RETURNED",
      language: state.language,
      intent: state.intent,
    });

    await this.events.create({
      callId,
      eventType: "CALLER_RETURNED",
      metadata: {},
    });

    const active = await this.states.upsert({
      callId,
      currentState: "ACTIVE_CONVERSATION",
      language: state.language,
      intent: state.intent,
    });

    return this.toSnapshot(call, active, conversation.id, conversation.turns);
  }

  async completeSession(callId: string): Promise<SessionSnapshot> {
    const { call, state, conversation } = await this.loadSession(callId);

    if (state.currentState === "CALL_COMPLETED") {
      return this.toSnapshot(call, state, conversation.id, conversation.turns);
    }

    const completedState = await this.states.upsert({
      callId,
      currentState: "CALL_COMPLETED",
      language: state.language,
      intent: state.intent,
    });

    await this.events.create({
      callId,
      eventType: "CALL_ENDED",
      metadata: {},
    });

    const updatedCall =
      (await this.calls.updateStatus(callId, "COMPLETED", new Date())) ?? call;

    return this.toSnapshot(updatedCall, completedState, conversation.id, conversation.turns);
  }

  private async loadSession(callId: string): Promise<{
    call: Call;
    state: ConversationStateRecord;
    conversation: { id: string; callId: string; turns: ConversationTurn[] };
  }> {
    const trimmed = callId.trim();
    if (!trimmed) {
      throw new ValidationError("callId is required");
    }

    const call = await this.calls.findById(trimmed);
    if (!call) {
      throw new NotFoundError(`Session not found: ${trimmed}`);
    }

    let state = await this.states.findByCallId(trimmed);
    if (!state) {
      state = await this.states.upsert({
        callId: trimmed,
        currentState: "ACTIVE_CONVERSATION",
        language: call.language,
        intent: null,
      });
    }

    let conversation = this.conversations.getByCallId(trimmed);
    if (!conversation) {
      conversation = this.conversations.create(trimmed);
      await this.hydrateTurnsFromEvents(trimmed, conversation.id);
      conversation = this.conversations.get(conversation.id)!;
    }

    return { call, state, conversation };
  }

  private async hydrateTurnsFromEvents(callId: string, conversationId: string): Promise<void> {
    const events = await this.events.listByCallId(callId);
    const turns: Array<Omit<ConversationTurn, "createdAt">> = [];

    for (const event of events) {
      const text = event.metadata?.text;
      if (typeof text !== "string" || !text.trim()) {
        continue;
      }
      if (event.eventType === "USER_SPEECH") {
        turns.push({ role: "user", content: text });
      } else if (event.eventType === "AGENT_RESPONSE") {
        turns.push({ role: "assistant", content: text });
      }
    }

    if (turns.length > 0) {
      this.conversations.replaceTurns(conversationId, turns);
    }
  }

  private assertNotCompleted(state: ConversationStateRecord): void {
    if (state.currentState === "CALL_COMPLETED" || state.currentState === "HUMAN_HANDOFF") {
      throw new ValidationError(
        `Session is closed (state ${state.currentState}) and cannot accept new turns`,
      );
    }
  }

  private toSnapshot(
    call: Call,
    state: ConversationStateRecord,
    conversationId: string,
    turns: ConversationTurn[],
  ): SessionSnapshot {
    const messages: SessionMessage[] = turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    return {
      callId: call.id,
      conversationId,
      callerNumber: call.callerNumber,
      language: call.language,
      callStatus: call.status,
      currentState: state.currentState,
      intent: state.intent,
      turns: turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
        createdAt: turn.createdAt.toISOString(),
      })),
      messages,
    };
  }
}

export const sessionService = new SessionService();
