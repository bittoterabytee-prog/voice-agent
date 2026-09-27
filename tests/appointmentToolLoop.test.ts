import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAppointmentToolCall } from "../src/ai/appointmentToolRunner";
import { runAppointmentToolLoop } from "../src/ai/appointmentToolLoop";
import { LlmService } from "../src/ai/llmService";
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

describe("KAN-111 appointment tool runner + loop", () => {
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

  it("TC-002 book without confirmed does not write", async () => {
    const patient = await patientRepository.create({
      name: "Loop Patient",
      phone: "+15550002111",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Loop",
      specialization: "ENT",
      workingHours: WEEKDAY_HOURS,
    });

    const execution = await executeAppointmentToolCall({
      name: "book_appointment",
      arguments: {
        patientId: patient.id,
        doctorId: doctor.id,
        date: "2026-10-14",
        time: "10:00:00",
      },
    });

    expect(execution.ok).toBe(true);
    expect((execution.result as { outcome: string }).outcome).toBe("needs_confirmation");
    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(0);
  });

  it("TC-001 book with confirmation persists via tool runner", async () => {
    const patient = await patientRepository.create({
      name: "Loop Book",
      phone: "+15550002112",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Book Loop",
      specialization: "Cardiology",
      workingHours: WEEKDAY_HOURS,
    });

    const execution = await executeAppointmentToolCall({
      name: "book_appointment",
      arguments: {
        patientId: patient.id,
        doctorId: doctor.id,
        date: "2026-10-14",
        time: "10:00:00",
        confirmed: true,
      },
    });

    expect(execution.ok).toBe(true);
    const result = execution.result as {
      outcome: string;
      confirmation: { appointmentId: string } | null;
    };
    expect(result.outcome).toBe("booked");
    expect(result.confirmation?.appointmentId).toBeTruthy();
    const stored = await appointmentRepository.findById(result.confirmation!.appointmentId);
    expect(stored?.status).toBe("SCHEDULED");
  });

  it("TC-003 unknown tool fails closed without inventing success", async () => {
    const execution = await executeAppointmentToolCall({
      name: "invent_slot",
      arguments: {},
    });
    expect(execution.ok).toBe(false);
    expect((execution.result as { error: { code: string } }).error.code).toBe("UNKNOWN_TOOL");
  });

  it("TC-004 empty availability is returned from check_availability tool", async () => {
    const doctor = await doctorRepository.create({
      name: "Dr. Empty",
      specialization: "Derm",
      workingHours: {
        saturday: { start: "09:00", end: "10:00" },
      },
    });

    // Monday window while doctor only works Saturday → empty/unavailable style outcome
    const execution = await executeAppointmentToolCall({
      name: "check_availability",
      arguments: {
        doctorId: doctor.id,
        window: {
          date: "2026-10-12", // Monday
          timeStart: "09:00:00",
          timeEnd: "12:00:00",
          partOfDay: "morning",
        },
      },
    });

    expect(execution.ok).toBe(true);
    const result = execution.result as { outcome: string; slots: unknown[] };
    expect(["empty", "unavailable"]).toContain(result.outcome);
    expect(result.slots).toEqual([]);
  });

  it("tool loop executes toolCalls then returns final spoken text", async () => {
    const patient = await patientRepository.create({
      name: "Loop Voice",
      phone: "+15550002113",
    });
    const doctor = await doctorRepository.create({
      name: "Dr. Voice Loop",
      specialization: "ENT",
      workingHours: WEEKDAY_HOURS,
    });

    let round = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      round += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ role?: string }>;
        tools?: unknown;
      };

      if (round === 1) {
        expect(body.tools).toBeTruthy();
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call_book_1",
                      type: "function",
                      function: {
                        name: "book_appointment",
                        arguments: JSON.stringify({
                          patientId: patient.id,
                          doctorId: doctor.id,
                          date: "2026-10-14",
                          time: "10:00:00",
                          confirmed: true,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        };
      }

      expect(body.messages?.some((m) => m.role === "tool")).toBe(true);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "Your appointment is booked for October 14 at 10 AM.",
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
        }),
      };
    });

    const llm = new LlmService({
      apiKey: "test-key",
      provider: "openai",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as never,
    });

    const result = await runAppointmentToolLoop({
      llm,
      messages: [{ role: "user", content: "Please book me with confirmation" }],
      language: "en",
      callId: null,
    });

    expect(result.toolRounds).toBe(1);
    expect(result.text).toContain("booked");
    expect(result.toolExecutions[0]?.ok).toBe(true);
    expect((result.toolExecutions[0]?.result as { outcome: string }).outcome).toBe("booked");

    const count = await getPool().query("SELECT COUNT(*)::int AS c FROM appointments");
    expect(count.rows[0].c).toBe(1);
  });
});
