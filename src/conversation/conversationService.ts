export type ConversationTurn = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
};

export type ConversationState = {
  id: string;
  callId: string;
  turns: ConversationTurn[];
};

export class ConversationService {
  private readonly conversations = new Map<string, ConversationState>();
  private readonly conversationIdByCallId = new Map<string, string>();

  create(callId: string): ConversationState {
    const existingId = this.conversationIdByCallId.get(callId);
    if (existingId) {
      const existing = this.conversations.get(existingId);
      if (existing) {
        return existing;
      }
    }

    const conversation: ConversationState = {
      id: crypto.randomUUID(),
      callId,
      turns: [],
    };
    this.conversations.set(conversation.id, conversation);
    this.conversationIdByCallId.set(callId, conversation.id);
    return conversation;
  }

  appendTurn(conversationId: string, turn: Omit<ConversationTurn, "createdAt">): ConversationState {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.turns.push({ ...turn, createdAt: new Date() });
    return conversation;
  }

  get(conversationId: string): ConversationState | undefined {
    return this.conversations.get(conversationId);
  }

  getByCallId(callId: string): ConversationState | undefined {
    const conversationId = this.conversationIdByCallId.get(callId);
    return conversationId ? this.conversations.get(conversationId) : undefined;
  }

  /** Drop in-memory turns (used when rehydrating from durable call_events). */
  replaceTurns(conversationId: string, turns: Omit<ConversationTurn, "createdAt">[]): ConversationState {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    conversation.turns = turns.map((turn) => ({ ...turn, createdAt: new Date() }));
    return conversation;
  }

  clear(): void {
    this.conversations.clear();
    this.conversationIdByCallId.clear();
  }
}

export const conversationService = new ConversationService();
