import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import { cancelAppointment } from "../src/services/cancelService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

const WEEKDAY_HOURS = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
};

describe("KAN-70 cancelAppointment", () => {
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

  async function seedScheduled() {
    const patient = await patientRepository.create({
      name: "Meera Iyer",
      phone: "+15550001001",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Cancel Target",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });
    const appointment = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-14",
      appointmentTime: "10:00:00",
      status: "SCHEDULED",
    });
    return { patient, doctor, appointment };
  }

  it("TC-001 cancels an active appointment when confirmed=true", async () => {
    const { patient, appointment } = await seedScheduled();
    const result = await cancelAppointment({
      appointmentId: appointment.id,
      patientId: patient.id,
      confirmed: true,
    });
    expect(result.outcome).toBe("cancelled");
    if (result.outcome !== "cancelled") return;
    expect(result.appointment.status).toBe("CANCELLED");
    const stored = await appointmentRepository.findById(appointment.id);
    expect(stored?.status).toBe("CANCELLED");
  });

  it("TC-002 leaves status active when confirmed is false", async () => {
    const { patient, appointment } = await seedScheduled();
    const result = await cancelAppointment({
      appointmentId: appointment.id,
      patientId: patient.id,
      confirmed: false,
    });
    expect(result.outcome).toBe("needs_confirmation");
    const stored = await appointmentRepository.findById(appointment.id);
    expect(stored?.status).toBe("SCHEDULED");
  });

  it("TC-003 returns distinct errors for not found, multiple matches, and already cancelled", async () => {
    const { patient, doctor, appointment } = await seedScheduled();

    const missing = await cancelAppointment({
      appointmentId: "00000000-0000-4000-8000-000000000099",
      patientId: patient.id,
      confirmed: true,
    });
    expect(missing.outcome).toBe("not_found");

    await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-15",
      appointmentTime: "11:00:00",
      status: "SCHEDULED",
    });
    const multi = await cancelAppointment({
      patientId: patient.id,
      confirmed: true,
    });
    expect(multi.outcome).toBe("multiple_matches");
    expect(await appointmentRepository.findById(appointment.id)).toMatchObject({
      status: "SCHEDULED",
    });

    await appointmentRepository.updateStatus(appointment.id, "CANCELLED");
    const already = await cancelAppointment({
      appointmentId: appointment.id,
      patientId: patient.id,
      confirmed: true,
    });
    expect(already.outcome).toBe("already_cancelled");
  });

  it("TC-004 policy rejection and DB failure do not report success", async () => {
    const { patient, doctor } = await seedScheduled();
    const completed = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-09-01",
      appointmentTime: "09:00:00",
      status: "COMPLETED",
    });
    const policy = await cancelAppointment({
      appointmentId: completed.id,
      patientId: patient.id,
      confirmed: true,
    });
    expect(policy.outcome).toBe("not_permitted");
    expect((await appointmentRepository.findById(completed.id))?.status).toBe("COMPLETED");

    const stranger = await patientRepository.create({
      name: "Stranger",
      phone: "+15550001002",
    });
    const owned = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-16",
      appointmentTime: "14:00:00",
      status: "SCHEDULED",
    });
    const wrongPatient = await cancelAppointment({
      appointmentId: owned.id,
      patientId: stranger.id,
      confirmed: true,
    });
    expect(wrongPatient.outcome).toBe("not_permitted");
    expect((await appointmentRepository.findById(owned.id))?.status).toBe("SCHEDULED");

    const originalUpdate = appointmentRepository.updateStatus.bind(appointmentRepository);
    appointmentRepository.updateStatus = async () => {
      throw new Error("simulated db failure");
    };
    try {
      const failed = await cancelAppointment({
        appointmentId: owned.id,
        patientId: patient.id,
        confirmed: true,
      });
      expect(failed.outcome).toBe("failed");
    } finally {
      appointmentRepository.updateStatus = originalUpdate;
    }
    expect((await appointmentRepository.findById(owned.id))?.status).toBe("SCHEDULED");
  });
});
