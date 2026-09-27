/**
 * KAN-113 — E2E appointment smoke (UI HTTP path + voice tool loop).
 *
 * Prerequisites: Postgres seeded, backend reachable at API_BASE (default http://localhost:3000),
 * and DATABASE_URL pointing at the same DB for the voice tool-loop check.
 *
 * Run: npx tsx scripts/smoke-kan113-appointment.ts
 * Or:  npm run smoke:kan113
 */
import { LlmService } from "../src/ai/llmService";
import { runAppointmentToolLoop } from "../src/ai/appointmentToolLoop";
import { closePool, connectDatabase, getPool } from "../src/db/pool";

const API_BASE = (process.env.API_BASE ?? "http://localhost:3000").replace(/\/$/, "");

function line(check: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} | ${check} | ${detail}`);
}

function hasSecretLeak(payload: unknown): boolean {
  const text = JSON.stringify(payload);
  return /sk-[A-Za-z0-9]{10,}/.test(text) || /Bearer\s+[A-Za-z0-9._-]{20,}/i.test(text);
}

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T;
  return { status: res.status, body: json };
}

async function main(): Promise<void> {
  let failed = 0;
  const assert = (check: string, ok: boolean, detail: string) => {
    line(check, ok, detail);
    if (!ok) failed += 1;
  };

  const healthRes = await fetch(`${API_BASE}/health`);
  const health = (await healthRes.json()) as { status?: string };
  assert("health", healthRes.status === 200 && health.status === "ok", `status=${healthRes.status}`);
  assert("health no secrets", !hasSecretLeak(health), "scanned");

  // --- TC-001 UI book path (same APIs the /appointments booking panel uses) ---
  const phone = `+1555${String(Date.now()).slice(-7)}`;
  const identify = await postJson<{
    outcome: string;
    patient?: { id: string; name: string };
  }>("/api/appointments/patients/identify", {
    phone,
    name: "KAN113 UI Smoke",
  });
  assert(
    "TC-001 identify",
    identify.status === 200 &&
      (identify.body.outcome === "registered" || identify.body.outcome === "found") &&
      Boolean(identify.body.patient?.id),
    `outcome=${identify.body.outcome}`,
  );

  const doctors = await postJson<{
    outcome: string;
    doctors?: Array<{ id: string; name: string }>;
  }>("/api/appointments/doctors/search", { specialization: "Cardiology" });
  const doctorId = doctors.body.doctors?.[0]?.id;
  assert(
    "TC-001 doctor search",
    doctors.status === 200 && Boolean(doctorId),
    `outcome=${doctors.body.outcome} count=${doctors.body.doctors?.length ?? 0}`,
  );

  const resolved = await postJson<{
    outcome: string;
    window?: {
      date: string;
      timeStart: string;
      timeEnd: string;
      partOfDay: string;
    };
  }>("/api/appointments/datetime/resolve", { phrase: "day after tomorrow morning" });
  assert(
    "TC-001 resolve datetime",
    resolved.status === 200 && resolved.body.outcome === "resolved" && Boolean(resolved.body.window),
    `outcome=${resolved.body.outcome}`,
  );

  const availability = await postJson<{
    outcome: string;
    slots?: Array<{ date: string; time: string }>;
  }>("/api/appointments/availability", {
    doctorId,
    window: resolved.body.window,
  });
  const slot = availability.body.slots?.[0];
  assert(
    "TC-001 availability",
    availability.status === 200 && Boolean(slot),
    `outcome=${availability.body.outcome} slots=${availability.body.slots?.length ?? 0}`,
  );

  const patientId = identify.body.patient!.id;
  const book = await postJson<{
    outcome: string;
    appointment?: { id: string; status: string };
    confirmation?: { appointmentId: string } | null;
  }>("/api/appointments/book", {
    patientId,
    doctorId,
    date: slot!.date,
    time: slot!.time,
    confirmed: true,
  });
  const uiApptId = book.body.appointment?.id ?? book.body.confirmation?.appointmentId;
  assert(
    "TC-001 UI book SCHEDULED",
    book.status === 200 &&
      book.body.outcome === "booked" &&
      book.body.appointment?.status === "SCHEDULED" &&
      Boolean(uiApptId),
    `outcome=${book.body.outcome} status=${book.body.appointment?.status}`,
  );

  const lookup = await postJson<{
    outcome: string;
    appointment?: { id: string; status: string };
  }>("/api/appointments/lookup", { appointmentId: uiApptId });
  assert(
    "TC-001 lookup confirms SCHEDULED",
    lookup.status === 200 &&
      lookup.body.outcome === "found" &&
      lookup.body.appointment?.status === "SCHEDULED",
    `outcome=${lookup.body.outcome} status=${lookup.body.appointment?.status}`,
  );
  assert(
    "TC-004 UI path no secrets",
    !hasSecretLeak({ identify, doctors, resolved, availability, book, lookup }),
    "scanned",
  );

  // --- TC-003 failure: book without confirm must not claim booked ---
  const noConfirmSlot =
    availability.body.slots?.[1] ??
    ({ date: slot!.date, time: "16:00:00" } as { date: string; time: string });
  const noConfirm = await postJson<{
    outcome: string;
    appointment?: { id: string } | null;
  }>("/api/appointments/book", {
    patientId,
    doctorId,
    date: noConfirmSlot.date,
    time: noConfirmSlot.time,
    confirmed: false,
  });
  assert(
    "TC-003 needs_confirmation not booked",
    noConfirm.status === 200 &&
      noConfirm.body.outcome === "needs_confirmation" &&
      !noConfirm.body.appointment,
    `outcome=${noConfirm.body.outcome}`,
  );

  // --- TC-002 voice tool loop confirm book (mocked LLM, real DB tools) ---
  // Use afternoon window so we do not collide with the morning UI booking.
  const voiceResolved = await postJson<{
    outcome: string;
    window?: {
      date: string;
      timeStart: string;
      timeEnd: string;
      partOfDay: string;
    };
  }>("/api/appointments/datetime/resolve", { phrase: "day after tomorrow afternoon" });
  const voiceAvail = await postJson<{
    outcome: string;
    slots?: Array<{ date: string; time: string }>;
  }>("/api/appointments/availability", {
    doctorId,
    window: voiceResolved.body.window,
  });
  const voiceSlot = voiceAvail.body.slots?.[0];
  assert(
    "TC-002 voice slot available",
    Boolean(voiceSlot),
    `outcome=${voiceAvail.body.outcome} slots=${voiceAvail.body.slots?.length ?? 0}`,
  );

  await connectDatabase();
  let round = 0;
  const fetchImpl = async (_url: string, _init?: RequestInit) => {
    round += 1;
    if (round === 1) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_kan113_book",
                    type: "function",
                    function: {
                      name: "book_appointment",
                      arguments: JSON.stringify({
                        patientId,
                        doctorId,
                        date: voiceSlot!.date,
                        time: voiceSlot!.time,
                        confirmed: true,
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Your appointment is confirmed and scheduled.",
            },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };
  };

  const llm = new LlmService({
    apiKey: "smoke-placeholder-key",
    provider: "openai",
    model: "gpt-4o-mini",
    fetchImpl: fetchImpl as never,
  });

  const voice = await runAppointmentToolLoop({
    llm,
    messages: [{ role: "user", content: "Yes, please book that slot. I confirm." }],
    language: "en",
    callId: null,
  });
  const voiceOutcome = (voice.toolExecutions[0]?.result as { outcome?: string } | undefined)
    ?.outcome;
  const voiceApptId = (
    voice.toolExecutions[0]?.result as
      | { confirmation?: { appointmentId?: string }; appointment?: { id?: string } }
      | undefined
  )?.confirmation?.appointmentId;
  assert(
    "TC-002 voice confirm book",
    voice.toolExecutions[0]?.ok === true &&
      voiceOutcome === "booked" &&
      Boolean(voiceApptId) &&
      /confirm|schedul|booked/i.test(voice.text),
    `outcome=${voiceOutcome} rounds=${voice.toolRounds}`,
  );

  if (voiceApptId) {
    const dbRow = await getPool().query<{ status: string }>(
      "SELECT status FROM appointments WHERE id = $1",
      [voiceApptId],
    );
    assert(
      "TC-002 DB SCHEDULED",
      dbRow.rows[0]?.status === "SCHEDULED",
      `status=${dbRow.rows[0]?.status ?? "missing"} time=${voiceSlot?.time}`,
    );
  } else {
    assert("TC-002 DB SCHEDULED", false, "missing appointment id");
  }

  assert("TC-004 voice path no secrets", !hasSecretLeak(voice), "scanned");

  await closePool().catch(() => undefined);

  if (failed > 0) {
    process.exitCode = 1;
    console.log(`SMOKE_FAIL checks_failed=${failed}`);
  } else {
    console.log("SMOKE_OK KAN-113");
  }
}

main().catch(async (err) => {
  console.error("SMOKE_FAIL", err);
  await closePool().catch(() => undefined);
  process.exitCode = 1;
});
