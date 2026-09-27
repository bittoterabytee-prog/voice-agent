import { getPool } from "../db/pool";
import { toPatient } from "../db/mappers";
import type { Patient } from "../models/patient";

export type CreatePatientInput = {
  name: string;
  phone: string;
  email?: string | null;
  preferredLanguage?: string;
};

export class PatientRepository {
  async create(input: CreatePatientInput): Promise<Patient> {
    const result = await getPool().query(
      `INSERT INTO patients (name, phone, email, preferred_language)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, input.phone, input.email ?? null, input.preferredLanguage ?? "en"],
    );
    return toPatient(result.rows[0]);
  }

  async findById(id: string): Promise<Patient | null> {
    const result = await getPool().query("SELECT * FROM patients WHERE id = $1", [id]);
    return result.rows[0] ? toPatient(result.rows[0]) : null;
  }

  /** All patients sharing this phone (multi-patient household supported). */
  async findAllByPhone(phone: string): Promise<Patient[]> {
    const result = await getPool().query(
      `SELECT * FROM patients
       WHERE phone = $1
       ORDER BY created_at ASC, id ASC`,
      [phone],
    );
    return result.rows.map((row) => toPatient(row));
  }

  /** Case-insensitive exact name match (multiple rows possible). */
  async findByNameExact(name: string): Promise<Patient[]> {
    const result = await getPool().query(
      `SELECT * FROM patients
       WHERE lower(name) = lower($1)
       ORDER BY created_at ASC, id ASC`,
      [name],
    );
    return result.rows.map((row) => toPatient(row));
  }
}

export const patientRepository = new PatientRepository();
