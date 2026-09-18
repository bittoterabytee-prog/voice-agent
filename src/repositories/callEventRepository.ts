import { getPool } from "../db/pool";
import { toCallEvent } from "../db/mappers";
import type { CallEvent } from "../models/callEvent";
import type { CallEventType } from "../models/enums";
import { InvalidRelationshipError, isPostgresForeignKeyError } from "../utils/errors";

export type CreateCallEventInput = {
  callId: string;
  eventType: CallEventType;
  metadata?: Record<string, unknown>;
};

export class CallEventRepository {
  async create(input: CreateCallEventInput): Promise<CallEvent> {
    try {
      const result = await getPool().query(
        `INSERT INTO call_events (call_id, event_type, metadata)
         VALUES ($1, $2, $3::jsonb)
         RETURNING *`,
        [input.callId, input.eventType, JSON.stringify(input.metadata ?? {})],
      );
      return toCallEvent(result.rows[0]);
    } catch (error) {
      if (isPostgresForeignKeyError(error)) {
        throw new InvalidRelationshipError("Call event references a call that does not exist");
      }
      throw error;
    }
  }

  async listByCallId(callId: string): Promise<CallEvent[]> {
    const result = await getPool().query(
      "SELECT * FROM call_events WHERE call_id = $1 ORDER BY timestamp ASC",
      [callId],
    );
    return result.rows.map(toCallEvent);
  }
}

export const callEventRepository = new CallEventRepository();
