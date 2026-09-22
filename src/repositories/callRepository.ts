import { getPool } from "../db/pool";
import { toCall } from "../db/mappers";
import type { Call } from "../models/call";
import type { CallStatus } from "../models/enums";

export type CreateCallInput = {
  callerNumber: string;
  language: string;
  status?: CallStatus;
};

export class CallRepository {
  async create(input: CreateCallInput): Promise<Call> {
    const result = await getPool().query(
      `INSERT INTO calls (caller_number, language, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.callerNumber, input.language, input.status ?? "ACTIVE"],
    );
    return toCall(result.rows[0]);
  }

  async findById(id: string): Promise<Call | null> {
    const result = await getPool().query("SELECT * FROM calls WHERE id = $1", [id]);
    return result.rows[0] ? toCall(result.rows[0]) : null;
  }

  async updateStatus(id: string, status: CallStatus, endTime?: Date | null): Promise<Call | null> {
    const result = await getPool().query(
      `UPDATE calls
       SET status = $2,
           end_time = COALESCE($3, end_time)
       WHERE id = $1
       RETURNING *`,
      [id, status, endTime ?? null],
    );
    return result.rows[0] ? toCall(result.rows[0]) : null;
  }
}

export const callRepository = new CallRepository();
