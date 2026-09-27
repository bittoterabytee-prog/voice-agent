import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import { checkAvailability } from "../src/services/availabilityService";
import type { ResolvedTimeWindow } from "../src/services/dateTimeResolver";
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
const WINDOW: ResolvedTimeWindow = {
  date: "2026-10-07",
  timeStart: "09:00:00",
  timeEnd: "12:00:00",
  partOfDay: "morning",
};

describe("KAN-67 checkAvailability", () => {
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

  it("TC-001 returns only slots inside working hours", async () => {
    const doctor = await doctorRepository.create({
      name: "Dr. Test Available",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });

    const result = await checkAvailability({ doctorId: doctor.id, window: WINDOW });
    expect(result.outcome).toBe("available");
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.date).toBe("2026-10-07");
      expect(slot.time >= "09:00:00").toBe(true);
      expect(slot.time < "12:00:00").toBe(true);
    }
  });

  it("TC-002 omits a slot that already has a SCHEDULED appointment", async () => {
    const doctor = await doctorRepository.create({
      name: "Dr. Booked",
      specialization: "ENT",
      workingHours: WEEKDAY_HOURS,
    });
    const patient = await patientRepository.create({
      name: "Asha Patel",
      phone: "+15550007001",
    });
    await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-07",
      appointmentTime: "10:00:00",
      status: "SCHEDULED",
    });

    const result = await checkAvailability({ doctorId: doctor.id, window: WINDOW });
    expect(result.slots.some((s) => s.time.startsWith("10:00"))).toBe(false);
    expect(result.slots.some((s) => s.time.startsWith("09:00"))).toBe(true);
  });

  it("TC-003 returns empty plus alternatives when the window is fully booked", async () => {
    const doctor = await doctorRepository.create({
      name: "Dr. Full Morning",
      specialization: "Orthopedics",
      workingHours: WEEKDAY_HOURS,
    });
    const patient = await patientRepository.create({
      name: "Ravi Kumar",
      phone: "+15550007002",
    });
    for (const time of ["09:00:00", "09:30:00", "10:00:00", "10:30:00", "11:00:00", "11:30:00"]) {
      await appointmentRepository.create({
        patientId: patient.id,
        doctorId: doctor.id,
        appointmentDate: "2026-10-07",
        appointmentTime: time,
        status: "SCHEDULED",
      });
    }

    const result = await checkAvailability({ doctorId: doctor.id, window: WINDOW });
    expect(result.outcome).toBe("empty");
    expect(result.slots).toHaveLength(0);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives.every((s) => s.date !== "2026-10-07")).toBe(true);
  });

  it("TC-004 returns unavailable for on-leave doctors and no slots outside hours", async () => {
    const onLeave = await doctorRepository.create({
      name: "Dr. On Leave",
      specialization: "Pediatrics",
      availabilityStatus: "ON_LEAVE",
      workingHours: WEEKDAY_HOURS,
    });
    const leaveResult = await checkAvailability({ doctorId: onLeave.id, window: WINDOW });
    expect(leaveResult.outcome).toBe("unavailable");
    expect(leaveResult.slots).toHaveLength(0);

    const sundayOnly = await doctorRepository.create({
      name: "Dr. Sunday Only",
      specialization: "Dental",
      workingHours: { sunday: { start: "10:00", end: "14:00" } },
    });
    // 2026-10-07 is Wednesday — outside hours
    const outside = await checkAvailability({ doctorId: sundayOnly.id, window: WINDOW });
    expect(outside.slots).toHaveLength(0);
    expect(["empty", "unavailable"]).toContain(outside.outcome);
  });
});
