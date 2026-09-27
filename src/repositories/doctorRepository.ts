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

  async search(filters: {
    name?: string;
    specialization?: string;
    department?: string;
    gender?: string;
  }): Promise<Doctor[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    const addIlike = (column: string, value: string | undefined) => {
      if (!value?.trim()) return;
      params.push(`%${value.trim()}%`);
      clauses.push(`${column} ILIKE $${params.length}`);
    };

    addIlike("name", filters.name);
    addIlike("specialization", filters.specialization);
    addIlike("department", filters.department);
    if (filters.gender?.trim()) {
      params.push(filters.gender.trim().toLowerCase());
      clauses.push(`lower(coalesce(gender, '')) = $${params.length}`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await getPool().query(
      `SELECT * FROM doctors
       ${where}
       ORDER BY name ASC, id ASC`,
      params,
    );
    return result.rows.map((row) => toDoctor(row));
  }
}

export const doctorRepository = new DoctorRepository();
