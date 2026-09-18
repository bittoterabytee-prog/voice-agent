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
}

export const appointmentRepository = new AppointmentRepository();
