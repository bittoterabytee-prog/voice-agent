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

  create(callId: string): ConversationState {
    const conversation: ConversationState = {
      id: crypto.randomUUID(),
      callId,
      turns: [],
    };
    this.conversations.set(conversation.id, conversation);
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
}

export const conversationService = new ConversationService();
