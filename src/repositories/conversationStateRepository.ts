import { getPool } from "../db/pool";
import { toConversationState } from "../db/mappers";
import type { ConversationStateRecord } from "../models/conversationState";
import type { ConversationStateName } from "../models/enums";
import { InvalidRelationshipError, isPostgresForeignKeyError } from "../utils/errors";

export type UpsertConversationStateInput = {
  callId: string;
  currentState: ConversationStateName;
  language: string;
  intent?: string | null;
};

export class ConversationStateRepository {
  async upsert(input: UpsertConversationStateInput): Promise<ConversationStateRecord> {
    try {
      const result = await getPool().query(
        `INSERT INTO conversation_states (call_id, current_state, language, intent, timestamp)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (call_id)
         DO UPDATE SET
           current_state = EXCLUDED.current_state,
           language = EXCLUDED.language,
           intent = EXCLUDED.intent,
           timestamp = NOW()
         RETURNING *`,
        [input.callId, input.currentState, input.language, input.intent ?? null],
      );
      return toConversationState(result.rows[0]);
    } catch (error) {
      if (isPostgresForeignKeyError(error)) {
        throw new InvalidRelationshipError(
          "Conversation state references a call that does not exist",
        );
      }
      throw error;
    }
  }

  async findByCallId(callId: string): Promise<ConversationStateRecord | null> {
    const result = await getPool().query("SELECT * FROM conversation_states WHERE call_id = $1", [
      callId,
    ]);
    return result.rows[0] ? toConversationState(result.rows[0]) : null;
  }
}

export const conversationStateRepository = new ConversationStateRepository();
