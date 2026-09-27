import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { appointmentRepository } from "../src/repositories/appointmentRepository";
import { callEventRepository } from "../src/repositories/callEventRepository";
import { callRepository } from "../src/repositories/callRepository";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { patientRepository } from "../src/repositories/patientRepository";
import {
  bookAppointmentTool,
  cancelAppointmentTool,
} from "../src/tools/appointmentTools";
import { runLoggedAppointmentTool } from "../src/services/appointmentToolLogger";
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

describe("KAN-73 appointment tool call_events", () => {
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

  async function seedCallPatientDoctor() {
    const call = await callRepository.create({
      callerNumber: "+15550001201",
      language: "en",
      status: "ACTIVE",
    });
    const patient = await patientRepository.create({
      name: "Log Test Patient",
      phone: "+15550001202",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Logger",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });
    return { call, patient, doctor };
  }

  it("TC-001 successful book writes TOOL_CALLED with tool name and appointment id", async () => {
    const { call, patient, doctor } = await seedCallPatientDoctor();
    const result = await bookAppointmentTool(
      {
        patientId: patient.id,
        doctorId: doctor.id,
        date: "2026-10-14",
        time: "10:00:00",
        confirmed: true,
      },
      { callId: call.id },
    );
    expect(result.outcome).toBe("booked");
    if (result.outcome !== "booked") return;

    const events = await callEventRepository.listByCallId(call.id);
    const toolEvents = events.filter(
      (e) =>
        e.eventType === "TOOL_CALLED" &&
        (e.metadata as { kind?: string }).kind === "appointment_tool",
    );
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0].metadata).toMatchObject({
      kind: "appointment_tool",
      tool: "bookAppointment",
      outcome: "booked",
      appointmentId: result.confirmation.appointmentId,
    });
  });

  it("TC-002 failed cancel write stores TOOL_FAILED and response is not success", async () => {
    const { call, patient, doctor } = await seedCallPatientDoctor();
    const appointment = await appointmentRepository.create({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentDate: "2026-10-15",
      appointmentTime: "11:00:00",
      status: "SCHEDULED",
    });

    const original = appointmentRepository.updateStatus.bind(appointmentRepository);
    appointmentRepository.updateStatus = async () => {
      throw new Error("simulated db failure password=supersecret");
    };

    try {
      const result = await cancelAppointmentTool(
        {
          appointmentId: appointment.id,
          patientId: patient.id,
          confirmed: true,
        },
        { callId: call.id },
      );
      expect(result.outcome).toBe("failed");

      const events = await callEventRepository.listByCallId(call.id);
      const failed = events.filter((e) => e.eventType === "TOOL_FAILED");
      expect(failed).toHaveLength(1);
      expect(failed[0].metadata).toMatchObject({
        kind: "appointment_tool",
        tool: "cancelAppointment",
        outcome: "failed",
      });
      const blob = JSON.stringify(failed[0].metadata);
      expect(blob).not.toContain("supersecret");
      expect(events.some((e) => e.eventType === "TOOL_CALLED")).toBe(false);
    } finally {
      appointmentRepository.updateStatus = original;
    }
  });

  it("TC-003 redacts API keys and connection-like secrets from event metadata", async () => {
    const { call } = await seedCallPatientDoctor();

    await expect(
      runLoggedAppointmentTool({ tool: "bookAppointment", callId: call.id }, async () => {
        throw new Error(
          "connect failed api_key=sk-abcdefghilmnopqr DATABASE_URL=postgres://u:p@h/db",
        );
      }),
    ).rejects.toThrow(/connect failed/);

    const events = await callEventRepository.listByCallId(call.id);
    const blob = JSON.stringify(events);
    expect(blob).not.toContain("sk-abcdefghilmnopqr");
    expect(blob).not.toMatch(/postgres:\/\/u:p@/);
    expect(blob).toContain("[REDACTED]");
    expect(events.some((e) => e.eventType === "TOOL_FAILED")).toBe(true);
  });

  it("TC-004 validation failure before write logs TOOL_FAILED only (no success event)", async () => {
    const { call, doctor } = await seedCallPatientDoctor();

    await expect(
      bookAppointmentTool(
        {
          patientId: "00000000-0000-4000-8000-000000000001",
          doctorId: doctor.id,
          date: "2026-10-14",
          time: "10:00:00",
          confirmed: true,
        },
        { callId: call.id },
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const events = await callEventRepository.listByCallId(call.id);
    expect(events.some((e) => e.eventType === "TOOL_CALLED")).toBe(false);
    const failed = events.filter((e) => e.eventType === "TOOL_FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0].metadata).toMatchObject({
      kind: "appointment_tool",
      tool: "bookAppointment",
      outcome: "error",
    });
  });
});
