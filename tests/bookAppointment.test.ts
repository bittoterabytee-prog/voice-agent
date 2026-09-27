import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import { bookAppointment } from "../src/services/bookingService";
import { ValidationError } from "../src/utils/errors";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

const WEEKDAY_HOURS = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
};

/** Wednesday 2026-10-07 */
const OPEN_DATE = "2026-10-07";
const OPEN_TIME = "10:00:00";

describe("KAN-69 bookAppointment", () => {
  beforeAll(async () => {
    testDatabase = await ensureTestDatabase();
    await connectDatabase();
    await runMigrations();
  });

  beforeEach(async () => {
    await getPool().query(
      "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await closePool();
    await testDatabase?.stop();
  });

  async function seedPatientDoctor() {
    const patient = await patientRepository.create({
      name: "Kavita Rao",
      phone: "+15550009001",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Bookable",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });
    return { patient, doctor };
  }

  it("TC-001 books a real open slot when confirmed=true and returns confirmation payload", async () => {
    const { patient, doctor } = await seedPatientDoctor();
    const result = await bookAppointment({
      patientId: patient.id,
      doctorId: doctor.id,
      date: OPEN_DATE,
      time: OPEN_TIME,
      confirmed: true,
    });

    expect(result.outcome).toBe("booked");
    if (result.outcome !== "booked") return;
    expect(result.confirmation.appointmentId).toBe(result.appointment.id);
    expect(result.confirmation.doctorName).toBe(doctor.name);
    expect(result.confirmation.date).toBe(OPEN_DATE);
    expect(result.confirmation.time).toBe(OPEN_TIME);
    expect(result.confirmation.status).toBe("SCHEDULED");

    const stored = await appointmentRepository.findById(result.appointment.id);
    expect(stored?.status).toBe("SCHEDULED");
  });

  it("TC-002 does not insert when confirmed is false or omitted", async () => {
    const { patient, doctor } = await seedPatientDoctor();

    const omitted = await bookAppointment({
      patientId: patient.id,
      doctorId: doctor.id,
      date: OPEN_DATE,
      time: OPEN_TIME,
    });
    expect(omitted.outcome).toBe("needs_confirmation");

    const denied = await bookAppointment({
      patientId: patient.id,
      doctorId: doctor.id,
      date: OPEN_DATE,
      time: OPEN_TIME,
      confirmed: false,
    });
    expect(denied.outcome).toBe("needs_confirmation");

    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(0);
  });

  it("TC-003 rejects a slot that checkAvailability would not return", async () => {
    const { patient, doctor } = await seedPatientDoctor();
    const result = await bookAppointment({
      patientId: patient.id,
      doctorId: doctor.id,
      date: OPEN_DATE,
      time: "20:00:00",
      confirmed: true,
    });
    expect(result.outcome).toBe("slot_unavailable");
    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(0);
  });

  it("TC-004 returns failed (not booked) when the database write conflicts", async () => {
    const { patient, doctor } = await seedPatientDoctor();
    const other = await patientRepository.create({
      name: "Other Patient",
      phone: "+15550009002",
    });

    const originalCreate = appointmentRepository.create.bind(appointmentRepository);
    appointmentRepository.create = async (input) => {
      await originalCreate({
        ...input,
        patientId: other.id,
      });
      return originalCreate(input);
    };

    try {
      const raced = await bookAppointment({
        patientId: patient.id,
        doctorId: doctor.id,
        date: OPEN_DATE,
        time: OPEN_TIME,
        confirmed: true,
      });
      expect(raced.outcome).toBe("failed");
      expect(raced.confirmation).toBeNull();
      expect(raced.message.toLowerCase()).toMatch(/fail|taken/);
    } finally {
      appointmentRepository.create = originalCreate;
    }

    const forPatient = await appointmentRepository.listByCriteria({
      patientId: patient.id,
      statuses: ["SCHEDULED"],
    });
    expect(forPatient).toHaveLength(0);
  });

  it("TC-005 validation fails and inserts nothing when patient or doctor is missing", async () => {
    const { patient, doctor } = await seedPatientDoctor();

    await expect(
      bookAppointment({
        patientId: "00000000-0000-4000-8000-000000000001",
        doctorId: doctor.id,
        date: OPEN_DATE,
        time: OPEN_TIME,
        confirmed: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      bookAppointment({
        patientId: patient.id,
        doctorId: "00000000-0000-4000-8000-000000000002",
        date: OPEN_DATE,
        time: OPEN_TIME,
        confirmed: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(0);
  });
});
