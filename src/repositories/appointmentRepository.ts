import { getPool } from "../db/pool";
import { toAppointment } from "../db/mappers";
import type { Appointment } from "../models/appointment";
import type { AppointmentStatus } from "../models/enums";
import { InvalidRelationshipError, isPostgresForeignKeyError } from "../utils/errors";

export type CreateAppointmentInput = {
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  status?: AppointmentStatus;
};

export class AppointmentRepository {
  async create(input: CreateAppointmentInput): Promise<Appointment> {
    try {
      const result = await getPool().query(
        `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.patientId,
          input.doctorId,
          input.appointmentDate,
          input.appointmentTime,
          input.status ?? "SCHEDULED",
        ],
      );
      return toAppointment(result.rows[0]);
    } catch (error) {
      if (isPostgresForeignKeyError(error)) {
        throw new InvalidRelationshipError(
          "Appointment references a patient or doctor that does not exist",
        );
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Appointment | null> {
    const result = await getPool().query("SELECT * FROM appointments WHERE id = $1", [id]);
    return result.rows[0] ? toAppointment(result.rows[0]) : null;
  }

  async listScheduledByDoctorDate(doctorId: string, appointmentDate: string): Promise<Appointment[]> {
    const result = await getPool().query(
      `SELECT * FROM appointments
       WHERE doctor_id = $1
         AND appointment_date = $2::date
         AND status = 'SCHEDULED'
       ORDER BY appointment_time ASC`,
      [doctorId, appointmentDate],
    );
    return result.rows.map((row) => toAppointment(row));
  }

  /**
   * Lookup by patient (+ optional doctor/date/status). Read-only; no status mutation (KAN-68).
   */
  async listByCriteria(input: {
    patientId: string;
    doctorId?: string;
    appointmentDate?: string;
    statuses?: AppointmentStatus[];
  }): Promise<Appointment[]> {
    const clauses = ["patient_id = $1"];
    const params: unknown[] = [input.patientId];

    if (input.doctorId) {
      params.push(input.doctorId);
      clauses.push(`doctor_id = $${params.length}`);
    }
    if (input.appointmentDate) {
      params.push(input.appointmentDate);
      clauses.push(`appointment_date = $${params.length}::date`);
    }
    if (input.statuses && input.statuses.length > 0) {
      params.push(input.statuses);
      clauses.push(`status = ANY($${params.length}::appointment_status[])`);
    }

    const result = await getPool().query(
      `SELECT * FROM appointments
       WHERE ${clauses.join(" AND ")}
       ORDER BY appointment_date ASC, appointment_time ASC`,
      params,
    );
    return result.rows.map((row) => toAppointment(row));
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment | null> {
    const result = await getPool().query(
      `UPDATE appointments
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status],
    );
    return result.rows[0] ? toAppointment(result.rows[0]) : null;
  }

  /** Move date/time on the same row (KAN-71 reschedule). Status stays SCHEDULED. */
  async updateSchedule(
    id: string,
    appointmentDate: string,
    appointmentTime: string,
  ): Promise<Appointment | null> {
    try {
      const result = await getPool().query(
        `UPDATE appointments
         SET appointment_date = $2::date,
             appointment_time = $3,
             updated_at = NOW()
         WHERE id = $1
           AND status = 'SCHEDULED'
         RETURNING *`,
        [id, appointmentDate, appointmentTime],
      );
      return result.rows[0] ? toAppointment(result.rows[0]) : null;
    } catch (error) {
      if (isPostgresForeignKeyError(error)) {
        throw new InvalidRelationshipError(
          "Appointment references a patient or doctor that does not exist",
        );
      }
      throw error;
    }
  }
}

export const appointmentRepository = new AppointmentRepository();
