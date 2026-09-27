import { getPool } from "../db/pool";
import { toDoctor } from "../db/mappers";
import type { Doctor, DoctorAvailabilityStatus, WorkingHours } from "../models/doctor";

export type CreateDoctorInput = {
  name: string;
  specialization: string;
  department?: string;
  gender?: string | null;
  availabilityStatus?: DoctorAvailabilityStatus;
  workingHours?: WorkingHours;
};

export class DoctorRepository {
  async create(input: CreateDoctorInput): Promise<Doctor> {
    const department = input.department ?? input.specialization;
    const result = await getPool().query(
      `INSERT INTO doctors (
         name, specialization, department, gender, availability_status, working_hours
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        input.name,
        input.specialization,
        department,
        input.gender ?? null,
        input.availabilityStatus ?? "AVAILABLE",
        JSON.stringify(input.workingHours ?? {}),
      ],
    );
    return toDoctor(result.rows[0]);
  }

  async findById(id: string): Promise<Doctor | null> {
    const result = await getPool().query("SELECT * FROM doctors WHERE id = $1", [id]);
    return result.rows[0] ? toDoctor(result.rows[0]) : null;
  }
}

export const doctorRepository = new DoctorRepository();
