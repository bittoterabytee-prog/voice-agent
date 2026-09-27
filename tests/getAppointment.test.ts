import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import { getAppointment } from "../src/services/appointmentLookupService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

const WEEKDAY_HOURS = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
};

describe("KAN-68 getAppointment", () => {
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

  it("TC-001 returns the row for a known appointment id", async () => {
    const patient = await patientRepository.create({
      name: "Neha Sharma",
      phone: "+15550008001",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Lookup",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });
    const created = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-08",
      appointmentTime: "10:00:00",
      status: "SCHEDULED",
    });

    const result = await getAppointment({ appointmentId: created.id });
    expect(result.outcome).toBe("found");
    if (result.outcome !== "found") return;
    expect(result.appointment.id).toBe(created.id);
    expect(result.isActive).toBe(true);
    // Read-only: status unchanged
    const again = await appointmentRepository.findById(created.id);
    expect(again?.status).toBe("SCHEDULED");
  });

  it("TC-002 returns not_found for an unknown id", async () => {
    const result = await getAppointment({
      appointmentId: "00000000-0000-4000-8000-000000000099",
    });
    expect(result.outcome).toBe("not_found");
    expect(result.appointment).toBeNull();
  });

  it("TC-003 returns multiple_matches when a patient has two upcoming appointments", async () => {
    const patient = await patientRepository.create({
      name: "Amit Verma",
      phone: "+15550008002",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Two Slots",
      specialization: "ENT",
      workingHours: WEEKDAY_HOURS,
    });
    await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-09",
      appointmentTime: "09:00:00",
      status: "SCHEDULED",
    });
    await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-10",
      appointmentTime: "11:00:00",
      status: "SCHEDULED",
    });

    const result = await getAppointment({ patientId: patient.id });
    expect(result.outcome).toBe("multiple_matches");
    if (result.outcome !== "multiple_matches") return;
    expect(result.appointments).toHaveLength(2);
    expect(result.appointment).toBeNull();
  });

  it("TC-004 returns cancelled status and isActive false for a cancelled appointment", async () => {
    const patient = await patientRepository.create({
      name: "Priya Nair",
      phone: "+15550008003",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Cancelled",
      specialization: "Dermatology",
      workingHours: WEEKDAY_HOURS,
    });
    const cancelled = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-11",
      appointmentTime: "14:00:00",
      status: "CANCELLED",
    });

    const byId = await getAppointment({ appointmentId: cancelled.id });
    expect(byId.outcome).toBe("found");
    if (byId.outcome !== "found") return;
    expect(byId.appointment.status).toBe("CANCELLED");
    expect(byId.isActive).toBe(false);

    // Default patient criteria only returns SCHEDULED — cancelled is not treated as active upcoming
    const byPatient = await getAppointment({ patientId: patient.id });
    expect(byPatient.outcome).toBe("not_found");

    const explicit = await getAppointment({
      patientId: patient.id,
      statuses: ["CANCELLED"],
    });
    expect(explicit.outcome).toBe("found");
    if (explicit.outcome !== "found") return;
    expect(explicit.isActive).toBe(false);
  });
});
