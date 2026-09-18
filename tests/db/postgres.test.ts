import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../../src/db/pool";
import { runMigrations } from "../../src/db/migrate";
import { appointmentRepository } from "../../src/repositories/appointmentRepository";
import { callEventRepository } from "../../src/repositories/callEventRepository";
import { callRepository } from "../../src/repositories/callRepository";
import { conversationStateRepository } from "../../src/repositories/conversationStateRepository";
import { doctorRepository } from "../../src/repositories/doctorRepository";
import { patientRepository } from "../../src/repositories/patientRepository";
import { InvalidRelationshipError } from "../../src/utils/errors";
import { ensureTestDatabase, type TestDatabaseHandle } from "../setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

describe("PostgreSQL persistence", () => {
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

  it("TC-001 connects to PostgreSQL", async () => {
    const result = await getPool().query("SELECT 1 AS ok");
    expect(result.rows[0].ok).toBe(1);
  });

  it("TC-010 creates required tables and relationships", async () => {
    const result = await getPool().query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY($1)`,
      [["patients", "doctors", "appointments", "calls", "conversation_states", "call_events"]],
    );
    expect(result.rows.map((row) => row.tablename).sort()).toEqual(
      ["appointments", "call_events", "calls", "conversation_states", "doctors", "patients"].sort(),
    );
  });

  it("TC-002 stores a patient", async () => {
    const patient = await patientRepository.create({
      name: "Maya Chen",
      phone: "+15551230001",
      email: "maya@example.com",
      preferredLanguage: "en",
    });

    const stored = await patientRepository.findById(patient.id);
    expect(stored).toMatchObject({
      name: "Maya Chen",
      phone: "+15551230001",
      email: "maya@example.com",
    });
  });

  it("TC-003 stores a doctor", async () => {
    const doctor = await doctorRepository.create({
      name: "Dr. Priya Shah",
      specialization: "Cardiology",
      workingHours: { monday: { start: "09:00", end: "15:00" } },
    });

    const stored = await doctorRepository.findById(doctor.id);
    expect(stored?.specialization).toBe("Cardiology");
    expect(stored?.workingHours.monday).toEqual({ start: "09:00", end: "15:00" });
  });

  it("TC-004 links an appointment to a patient and doctor", async () => {
    const patient = await patientRepository.create({
      name: "Sam Rivera",
      phone: "+15551230002",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Alex Kim",
      specialization: "Dermatology",
    });

    const appointment = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-09-20",
      appointmentTime: "14:00:00",
      status: "SCHEDULED",
    });

    const stored = await appointmentRepository.findById(appointment.id);
    expect(stored?.patientId).toBe(patient.id);
    expect(stored?.doctorId).toBe(doctor.id);
    expect(stored?.status).toBe("SCHEDULED");
  });

  it("TC-005 stores call metadata", async () => {
    const call = await callRepository.create({
      callerNumber: "+15551239999",
      language: "en",
    });

    const stored = await callRepository.findById(call.id);
    expect(stored).toMatchObject({
      id: call.id,
      callerNumber: "+15551239999",
      language: "en",
      status: "ACTIVE",
    });
  });

  it("TC-006 persists conversation state changes", async () => {
    const call = await callRepository.create({
      callerNumber: "+15551230003",
      language: "en",
    });

    await conversationStateRepository.upsert({
      callId: call.id,
      currentState: "ACTIVE_CONVERSATION",
      language: "en",
      intent: "book_appointment",
    });

    const waiting = await conversationStateRepository.upsert({
      callId: call.id,
      currentState: "WAITING_FOR_USER",
      language: "en",
      intent: "book_appointment",
    });

    const stored = await conversationStateRepository.findByCallId(call.id);
    expect(stored?.id).toBe(waiting.id);
    expect(stored?.currentState).toBe("WAITING_FOR_USER");
  });

  it("TC-007 stores call events with timestamps", async () => {
    const call = await callRepository.create({
      callerNumber: "+15551230004",
      language: "en",
    });

    const event = await callEventRepository.create({
      callId: call.id,
      eventType: "WAIT_STARTED",
      metadata: { reason: "user_requested_wait" },
    });

    const events = await callEventRepository.listByCallId(call.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: event.id,
      callId: call.id,
      eventType: "WAIT_STARTED",
    });
    expect(events[0].timestamp).toBeInstanceOf(Date);
  });

  it("TC-008 rejects appointments with invalid foreign keys", async () => {
    const missingId = "00000000-0000-4000-8000-000000000001";
    await expect(
      appointmentRepository.create({
        patientId: missingId,
        doctorId: missingId,
        appointmentDate: "2026-09-21",
        appointmentTime: "09:00:00",
      }),
    ).rejects.toBeInstanceOf(InvalidRelationshipError);
  });

  it("TC-009 keeps records after a new connection is opened", async () => {
    const patient = await patientRepository.create({
      name: "Persistent Patient",
      phone: "+15551230005",
    });

    await closePool();
    await connectDatabase();

    const stored = await patientRepository.findById(patient.id);
    expect(stored?.name).toBe("Persistent Patient");
  });
});
