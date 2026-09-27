import { closePool, getPool } from "./pool";
import { runMigrations } from "./migrate";
import { appointmentRepository } from "../repositories/appointmentRepository";
import { callEventRepository } from "../repositories/callEventRepository";
import { callRepository } from "../repositories/callRepository";
import { conversationStateRepository } from "../repositories/conversationStateRepository";
import { doctorRepository } from "../repositories/doctorRepository";
import { patientRepository } from "../repositories/patientRepository";
import type { Doctor } from "../models/doctor";
import { logger } from "../utils/logger";
import { SAKET_SEED_DOCTORS, WEEKDAY_HOURS } from "./seedDoctors";

/**
 * Demo phones only — never real personal numbers (KAN-104 TC-004).
 * Doctor catalog: every medical consultant on sakethospital.in/our-doctors
 * plus fillers across Specialities (~50 total). See seedDoctors.ts.
 */
export const SEED_MARKER_PHONE = "+15550001001";

const CARDIOLOGY_BUSY_DATE = "2026-10-06";
/** Slots within Cardiology OPD window for empty-availability demos. */
const CARDIOLOGY_SLOT_TIMES = [
  "10:00:00",
  "10:30:00",
  "11:00:00",
  "11:30:00",
  "12:00:00",
  "12:30:00",
  "13:00:00",
  "13:30:00",
  "14:00:00",
] as const;

export type SeedSummary = {
  patients: number;
  doctors: number;
  appointments: number;
  websiteDoctors: number;
  skipped: boolean;
  reset: boolean;
};

async function clearSeedTables(): Promise<void> {
  await getPool().query(
    "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
  );
}

async function hasSeedMarker(): Promise<boolean> {
  const result = await getPool().query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM patients WHERE phone = $1",
    [SEED_MARKER_PHONE],
  );
  return result.rows[0].count > 0;
}

function requireDoctor(doctors: Doctor[], name: string): Doctor {
  const found = doctors.find((doctor) => doctor.name === name);
  if (!found) {
    throw new Error(`Seed doctor missing: ${name}`);
  }
  return found;
}

export async function seedDatabase(options?: { reset?: boolean }): Promise<SeedSummary> {
  await runMigrations();

  const reset =
    options?.reset === true ||
    process.env.SEED_RESET === "1" ||
    process.argv.includes("--reset");
  if (reset) {
    await clearSeedTables();
  } else if (await hasSeedMarker()) {
    logger.info({ markerPhone: SEED_MARKER_PHONE }, "Seed data already present, skipping");
    const counts = await getPool().query<{
      patients: number;
      doctors: number;
      appointments: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM patients) AS patients,
         (SELECT COUNT(*)::int FROM doctors) AS doctors,
         (SELECT COUNT(*)::int FROM appointments) AS appointments`,
    );
    return {
      patients: counts.rows[0].patients,
      doctors: counts.rows[0].doctors,
      appointments: counts.rows[0].appointments,
      websiteDoctors: SAKET_SEED_DOCTORS.filter((d) => d.fromWebsite).length,
      skipped: true,
      reset: false,
    };
  }

  const patientAsha = await patientRepository.create({
    name: "Asha Patel",
    phone: SEED_MARKER_PHONE,
    email: "asha.patel@example.com",
    preferredLanguage: "hi",
  });
  const patientRavi = await patientRepository.create({
    name: "Ravi Kumar",
    phone: "+15550001002",
    email: "ravi.kumar@example.com",
    preferredLanguage: "hi",
  });
  const patientMeera = await patientRepository.create({
    name: "Meera Sharma",
    phone: "+15550001003",
    email: "meera.sharma@example.com",
    preferredLanguage: "en",
  });

  const createdDoctors: Doctor[] = [];
  for (const entry of SAKET_SEED_DOCTORS) {
    createdDoctors.push(
      await doctorRepository.create({
        name: entry.name,
        specialization: entry.specialization,
        department: entry.department,
        gender: entry.gender,
        availabilityStatus: entry.availabilityStatus ?? "AVAILABLE",
        workingHours: entry.workingHours ?? WEEKDAY_HOURS,
      }),
    );
  }

  const doctorFamily = requireDoctor(createdDoctors, "Dr. Praveen Manglunia");
  const doctorCardio = requireDoctor(createdDoctors, "Dr. Hariram Maharia");
  const doctorOrtho = requireDoctor(createdDoctors, "Dr. Rohit Yogendra Goyal");

  await appointmentRepository.create({
    patientId: patientAsha.id,
    doctorId: doctorFamily.id,
    appointmentDate: "2026-10-07",
    appointmentTime: "10:30:00",
    status: "SCHEDULED",
  });

  for (const time of CARDIOLOGY_SLOT_TIMES) {
    await appointmentRepository.create({
      patientId: patientRavi.id,
      doctorId: doctorCardio.id,
      appointmentDate: CARDIOLOGY_BUSY_DATE,
      appointmentTime: time,
      status: "SCHEDULED",
    });
  }

  await appointmentRepository.create({
    patientId: patientMeera.id,
    doctorId: doctorOrtho.id,
    appointmentDate: "2026-10-09",
    appointmentTime: "11:00:00",
    status: "SCHEDULED",
  });
  await appointmentRepository.create({
    patientId: patientMeera.id,
    doctorId: doctorOrtho.id,
    appointmentDate: "2026-09-15",
    appointmentTime: "11:00:00",
    status: "CANCELLED",
  });

  const call = await callRepository.create({
    callerNumber: patientAsha.phone,
    language: "hi",
    status: "ACTIVE",
  });
  await conversationStateRepository.upsert({
    callId: call.id,
    currentState: "ACTIVE_CONVERSATION",
    language: "hi",
    intent: "schedule_appointment",
  });
  await callEventRepository.create({
    callId: call.id,
    eventType: "CALL_STARTED",
    metadata: {
      source: "seed",
      ticket: "KAN-104",
      clinic: "Saket Hospital, Jaipur",
      clinicUrl: "https://www.sakethospital.in/",
      doctorsCatalog: "https://www.sakethospital.in/our-doctors/",
    },
  });

  const websiteDoctors = SAKET_SEED_DOCTORS.filter((d) => d.fromWebsite).length;
  const appointmentCount = 1 + CARDIOLOGY_SLOT_TIMES.length + 2;
  logger.info(
    {
      patients: 3,
      doctors: createdDoctors.length,
      websiteDoctors,
      appointments: appointmentCount,
      cardioBusyDate: CARDIOLOGY_BUSY_DATE,
      callId: call.id,
      clinic: "Saket Hospital, Jaipur",
    },
    "Loaded Sprint 4 appointment seed data",
  );

  return {
    patients: 3,
    doctors: createdDoctors.length,
    appointments: appointmentCount,
    websiteDoctors,
    skipped: false,
    reset,
  };
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset") || process.env.SEED_RESET === "1";
  const summary = await seedDatabase({ reset });
  logger.info(summary, "Database seed complete");
  await closePool();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error({ err: error }, "Database seed failed");
    process.exit(1);
  });
}
