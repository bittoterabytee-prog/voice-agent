export type ConversationRecord = {
  id: string;
  callId: string;
};

export interface ConversationRepository {
  save(record: ConversationRecord): Promise<void>;
  findByCallId(callId: string): Promise<ConversationRecord | null>;
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly records = new Map<string, ConversationRecord>();

  async save(record: ConversationRecord): Promise<void> {
    this.records.set(record.callId, record);
  }

  async findByCallId(callId: string): Promise<ConversationRecord | null> {
    return this.records.get(callId) ?? null;
  }
}
