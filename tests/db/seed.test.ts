import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../../src/db/pool";
import { runMigrations } from "../../src/db/migrate";
import { SEED_MARKER_PHONE, seedDatabase } from "../../src/db/seed";
import { ensureTestDatabase, type TestDatabaseHandle } from "../setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

describe("KAN-104 appointment schema and seed", () => {
  beforeAll(async () => {
    testDatabase = await ensureTestDatabase();
    await connectDatabase();
  });

  beforeEach(async () => {
    await runMigrations();
    await getPool().query(
      "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await closePool();
    await testDatabase?.stop();
  });

  it("TC-001 migrates patients, doctors.working_hours, and appointment columns", async () => {
    const tables = await getPool().query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY($1)`,
      [["patients", "doctors", "appointments"]],
    );
    expect(tables.rows.map((row) => row.tablename).sort()).toEqual(
      ["appointments", "doctors", "patients"].sort(),
    );

    const doctorCols = await getPool().query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'doctors'`,
    );
    const names = doctorCols.rows.map((row) => row.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "working_hours",
        "department",
        "gender",
        "availability_status",
      ]),
    );

    const migrations = await getPool().query<{ id: string }>(
      "SELECT id FROM schema_migrations ORDER BY id",
    );
    expect(migrations.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(["001_init.sql", "002_appointment_sprint4_gaps.sql"]),
    );
  });

  it("TC-002 seeds patients, multiple specialties, and working hours", async () => {
    const summary = await seedDatabase({ reset: true });
    expect(summary.skipped).toBe(false);
    expect(summary.patients).toBeGreaterThanOrEqual(1);
    expect(summary.doctors).toBeGreaterThanOrEqual(50);

    const specialties = await getPool().query<{ specialization: string }>(
      "SELECT DISTINCT specialization FROM doctors",
    );
    expect(specialties.rows.length).toBeGreaterThanOrEqual(2);

    const hours = await getPool().query<{ working_hours: Record<string, unknown> }>(
      "SELECT working_hours FROM doctors WHERE availability_status = 'AVAILABLE' LIMIT 1",
    );
    expect(Object.keys(hours.rows[0].working_hours).length).toBeGreaterThan(0);

    const marker = await getPool().query("SELECT 1 FROM patients WHERE phone = $1", [
      SEED_MARKER_PHONE,
    ]);
    expect(marker.rowCount).toBe(1);

    const names = await getPool().query<{ name: string }>(
      "SELECT name FROM doctors ORDER BY name",
    );
    expect(names.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "Dr. Hariram Maharia",
        "Dr. Praveen Manglunia",
        "Dr. Rohit Yogendra Goyal",
        "Dr. Neelam Bapna",
        "Dr. Dilip Dubey",
      ]),
    );
    expect(names.rows.every((row) => row.name.startsWith("Dr."))).toBe(true);
    expect(names.rows).toHaveLength(50);
  });

  it("TC-003 seeds a fully booked doctor day for empty-availability demos", async () => {
    await seedDatabase({ reset: true });
    const busy = await getPool().query<{ count: number; appointment_date: string }>(
      `SELECT appointment_date::text AS appointment_date, COUNT(*)::int AS count
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE d.specialization = 'Cardiology'
         AND a.status = 'SCHEDULED'
       GROUP BY appointment_date
       ORDER BY count DESC
       LIMIT 1`,
    );
    expect(busy.rows[0].count).toBeGreaterThanOrEqual(8);
  });

  it("TC-004 seed phones are demo +1555 numbers with no secret-like values", async () => {
    await seedDatabase({ reset: true });
    const phones = await getPool().query<{ phone: string; email: string | null }>(
      "SELECT phone, email FROM patients",
    );
    for (const row of phones.rows) {
      expect(row.phone.startsWith("+1555")).toBe(true);
      expect(row.phone).not.toMatch(/sk-/i);
      if (row.email) {
        expect(row.email).toMatch(/@example\.com$/);
      }
    }
  });

  it("TC-005 re-running seed is idempotent unless SEED_RESET/reset is used", async () => {
    const first = await seedDatabase({ reset: true });
    expect(first.skipped).toBe(false);

    const second = await seedDatabase();
    expect(second.skipped).toBe(true);
    expect(second.patients).toBe(first.patients);
    expect(second.doctors).toBe(first.doctors);

    const third = await seedDatabase({ reset: true });
    expect(third.skipped).toBe(false);
    expect(third.patients).toBe(first.patients);
  });

  it("rejects a second SCHEDULED booking on the same doctor slot", async () => {
    await seedDatabase({ reset: true });
    const row = await getPool().query<{
      patient_id: string;
      doctor_id: string;
      appointment_date: string;
      appointment_time: string;
    }>(
      `SELECT patient_id, doctor_id, appointment_date::text AS appointment_date,
              appointment_time::text AS appointment_time
       FROM appointments
       WHERE status = 'SCHEDULED'
       LIMIT 1`,
    );
    const slot = row.rows[0];
    await expect(
      getPool().query(
        `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status)
         VALUES ($1, $2, $3::date, $4::time, 'SCHEDULED')`,
        [slot.patient_id, slot.doctor_id, slot.appointment_date.slice(0, 10), slot.appointment_time],
      ),
    ).rejects.toThrow();
  });
});
