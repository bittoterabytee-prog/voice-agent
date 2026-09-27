import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import { rescheduleAppointment } from "../src/services/rescheduleService";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

const WEEKDAY_HOURS = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
};

/** Wednesday 2026-10-14 */
const ORIG_DATE = "2026-10-14";
const ORIG_TIME = "10:00:00";
const NEW_TIME = "11:00:00";

describe("KAN-71 rescheduleAppointment", () => {
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
      name: "Arjun Mehta",
      phone: "+15550001101",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Reschedule",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });
    const appointment = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: ORIG_DATE,
      appointmentTime: ORIG_TIME,
      status: "SCHEDULED",
    });
    return { patient, doctor, appointment };
  }

  it("TC-001 moves the same appointment id to a new open slot when confirmed", async () => {
    const { patient, appointment } = await seedScheduled();
    const result = await rescheduleAppointment({
      appointmentId: appointment.id,
      patientId: patient.id,
      date: ORIG_DATE,
      time: NEW_TIME,
      confirmed: true,
    });
    expect(result.outcome).toBe("rescheduled");
    if (result.outcome !== "rescheduled") return;
    expect(result.appointment.id).toBe(appointment.id);
    expect(result.appointment.appointmentDate).toBe(ORIG_DATE);
    expect(result.appointment.appointmentTime).toBe(NEW_TIME);
    expect(result.previous).toEqual({ date: ORIG_DATE, time: ORIG_TIME });
  });

  it("TC-002 leaves the original time when the new slot is not available", async () => {
    const { patient, appointment } = await seedScheduled();
    const result = await rescheduleAppointment({
      appointmentId: appointment.id,
      patientId: patient.id,
      date: ORIG_DATE,
      time: "20:00:00",
      confirmed: true,
    });
    expect(result.outcome).toBe("slot_unavailable");
    const stored = await appointmentRepository.findById(appointment.id);
    expect(stored?.appointmentTime).toBe(ORIG_TIME);
  });

  it("TC-003 rejects a stale candidate when the user changed the requested time", async () => {
    const { patient, appointment } = await seedScheduled();
    const result = await rescheduleAppointment({
      appointmentId: appointment.id,
      patientId: patient.id,
      date: ORIG_DATE,
      time: NEW_TIME,
      latestRequestedDate: ORIG_DATE,
      latestRequestedTime: "14:00:00",
      confirmed: true,
    });
    expect(result.outcome).toBe("stale_candidate");
    const stored = await appointmentRepository.findById(appointment.id);
    expect(stored?.appointmentTime).toBe(ORIG_TIME);
  });

  it("TC-004 leaves the original slot on DB failure and does not report success", async () => {
    const { patient, appointment } = await seedScheduled();
    const original = appointmentRepository.updateSchedule.bind(appointmentRepository);
    appointmentRepository.updateSchedule = async () => {
      throw new Error("simulated db failure");
    };
    try {
      const result = await rescheduleAppointment({
        appointmentId: appointment.id,
        patientId: patient.id,
        date: ORIG_DATE,
        time: NEW_TIME,
        confirmed: true,
      });
      expect(result.outcome).toBe("failed");
    } finally {
      appointmentRepository.updateSchedule = original;
    }
    const stored = await appointmentRepository.findById(appointment.id);
    expect(stored?.appointmentTime).toBe(ORIG_TIME);
  });
});
