import { closePool, getPool } from "./pool";
import { runMigrations } from "./migrate";
import { appointmentRepository } from "../repositories/appointmentRepository";
import { callEventRepository } from "../repositories/callEventRepository";
import { callRepository } from "../repositories/callRepository";
import { conversationStateRepository } from "../repositories/conversationStateRepository";
import { doctorRepository } from "../repositories/doctorRepository";
import { patientRepository } from "../repositories/patientRepository";
import { logger } from "../utils/logger";

export async function seedDatabase(): Promise<void> {
  await runMigrations();

  const existing = await getPool().query("SELECT COUNT(*)::int AS count FROM patients");
  if (existing.rows[0].count > 0) {
    logger.info("Seed data already present, skipping");
    return;
  }

  const patient = await patientRepository.create({
    name: "Asha Patel",
    phone: "+15550001111",
    email: "asha.patel@example.com",
    preferredLanguage: "en",
  });

  const doctor = await doctorRepository.create({
    name: "Dr. Jordan Lee",
    specialization: "General Practice",
    workingHours: {
      monday: { start: "09:00", end: "17:00" },
      tuesday: { start: "09:00", end: "17:00" },
    },
  });

  await appointmentRepository.create({
    patientId: patient.id,
    doctorId: doctor.id,
    appointmentDate: "2026-09-18",
    appointmentTime: "10:30:00",
    status: "SCHEDULED",
  });

  const call = await callRepository.create({
    callerNumber: patient.phone,
    language: "en",
    status: "ACTIVE",
  });

  await conversationStateRepository.upsert({
    callId: call.id,
    currentState: "ACTIVE_CONVERSATION",
    language: "en",
    intent: "schedule_appointment",
  });

  await callEventRepository.create({
    callId: call.id,
    eventType: "CALL_STARTED",
    metadata: { source: "seed" },
  });

  logger.info({ patientId: patient.id, doctorId: doctor.id, callId: call.id }, "Loaded seed data");
}

async function main(): Promise<void> {
  await seedDatabase();
  await closePool();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error({ err: error }, "Database seed failed");
    process.exit(1);
  });
}
