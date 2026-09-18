import { getPool } from "../db/pool";
import { toDoctor } from "../db/mappers";
import type { Doctor, WorkingHours } from "../models/doctor";

export type CreateDoctorInput = {
  name: string;
  specialization: string;
  workingHours?: WorkingHours;
};

export class DoctorRepository {
  async create(input: CreateDoctorInput): Promise<Doctor> {
    const result = await getPool().query(
      `INSERT INTO doctors (name, specialization, working_hours)
       VALUES ($1, $2, $3::jsonb)
       RETURNING *`,
      [input.name, input.specialization, JSON.stringify(input.workingHours ?? {})],
    );
    return toDoctor(result.rows[0]);
  }

  async findById(id: string): Promise<Doctor | null> {
    const result = await getPool().query("SELECT * FROM doctors WHERE id = $1", [id]);
    return result.rows[0] ? toDoctor(result.rows[0]) : null;
  }
}

export const doctorRepository = new DoctorRepository();
