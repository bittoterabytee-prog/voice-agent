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

  async listRecent(limit = 50): Promise<Call[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 200) : 50;
    const result = await getPool().query(
      `SELECT * FROM calls
       ORDER BY COALESCE(end_time, start_time) DESC, created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(toCall);
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

  /** Persist session language preference on the call row (KAN-28). */
  async updateLanguage(id: string, language: string): Promise<Call | null> {
    const result = await getPool().query(
      `UPDATE calls
       SET language = $2
       WHERE id = $1
       RETURNING *`,
      [id, language],
    );
    return result.rows[0] ? toCall(result.rows[0]) : null;
  }
}

export const callRepository = new CallRepository();
