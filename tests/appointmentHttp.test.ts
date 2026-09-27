import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

const WEEKDAY_HOURS = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
};

describe("KAN-72 appointment HTTP APIs", () => {
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

  it("TC-001 search route returns doctor matches from the database", async () => {
    await doctorRepository.create({
      name: "Dr. HTTP Search",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });

    const res = await request(createApp())
      .post("/api/appointments/doctors/search")
      .send({ specialization: "Cardiology" });

    expect(res.status).toBe(200);
    expect(["found", "multiple_matches"]).toContain(res.body.outcome);
    expect(res.body.doctors.length).toBeGreaterThan(0);
    expect(res.body.doctors[0].specialization).toBe("Cardiology");
  });

  it("TC-002 missing required fields on mutate routes return 400 and write nothing", async () => {
    const book = await request(createApp()).post("/api/appointments/book").send({
      doctorId: "00000000-0000-4000-8000-000000000001",
      date: "2026-10-14",
      time: "10:00:00",
      confirmed: true,
    });
    expect(book.status).toBe(400);
    expect(book.body.error.code).toBe("VALIDATION_ERROR");

    const cancel = await request(createApp()).post("/api/appointments/cancel").send({
      confirmed: true,
    });
    expect(cancel.status).toBe(400);

    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(0);
  });

  it("TC-003 book without confirmation is not a successful booking", async () => {
    const patient = await patientRepository.create({
      name: "HTTP Patient",
      phone: "+15550001301",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. HTTP Book",
      specialization: "ENT",
      workingHours: WEEKDAY_HOURS,
    });

    const res = await request(createApp()).post("/api/appointments/book").send({
      patientId: patient.id,
      doctorId: doctor.id,
      date: "2026-10-14",
      time: "10:00:00",
    });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("needs_confirmation");
    expect(res.body.confirmation).toBeNull();

    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(0);
  });

  it("smoke: identify, availability, lookup, cancel, reschedule round-trip", async () => {
    const doctor = await doctorRepository.create({
      name: "Dr. Smoke Route",
      specialization: "Dermatology",
      workingHours: WEEKDAY_HOURS,
    });

    const identified = await request(createApp())
      .post("/api/appointments/patients/identify")
      .send({ phone: "+15550001302", name: "Smoke User" });
    expect(identified.status).toBe(200);
    expect(["found", "registered"]).toContain(identified.body.outcome);
    const patientId = identified.body.patient.id as string;

    const avail = await request(createApp())
      .post("/api/appointments/availability")
      .send({
        doctorId: doctor.id,
        window: {
          date: "2026-10-14",
          timeStart: "09:00:00",
          timeEnd: "12:00:00",
          partOfDay: "morning",
        },
      });
    expect(avail.status).toBe(200);
    expect(avail.body.outcome).toBe("available");

    const book = await request(createApp()).post("/api/appointments/book").send({
      patientId,
      doctorId: doctor.id,
      date: "2026-10-14",
      time: "10:00:00",
      confirmed: true,
    });
    expect(book.status).toBe(200);
    expect(book.body.outcome).toBe("booked");
    const appointmentId = book.body.confirmation.appointmentId as string;

    const lookup = await request(createApp())
      .post("/api/appointments/lookup")
      .send({ appointmentId });
    expect(lookup.status).toBe(200);
    expect(lookup.body.outcome).toBe("found");

    const reschedule = await request(createApp())
      .post("/api/appointments/reschedule")
      .send({
        appointmentId,
        patientId,
        date: "2026-10-14",
        time: "11:00:00",
        confirmed: true,
      });
    expect(reschedule.status).toBe(200);
    expect(reschedule.body.outcome).toBe("rescheduled");

    const cancel = await request(createApp()).post("/api/appointments/cancel").send({
      appointmentId,
      patientId,
      confirmed: true,
    });
    expect(cancel.status).toBe(200);
    expect(cancel.body.outcome).toBe("cancelled");

    const stored = await appointmentRepository.findById(appointmentId);
    expect(stored?.status).toBe("CANCELLED");
  });
});
