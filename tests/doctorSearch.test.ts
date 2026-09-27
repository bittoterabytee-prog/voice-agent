import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { doctorRepository } from "../src/repositories/doctorRepository";
import { searchDoctor } from "../src/services/doctorService";
import { searchDoctorTool } from "../src/tools/appointmentTools";
import { ValidationError } from "../src/utils/errors";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

describe("KAN-65 searchDoctor", () => {
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

  it("TC-001 returns matching doctors for a seeded specialty", async () => {
    await doctorRepository.create({
      name: "Dr. Hariram Maharia",
      specialization: "Cardiology",
      department: "Cardiology",
    });
    await doctorRepository.create({
      name: "Dr. Anita Verma",
      specialization: "Dermatology",
      department: "Dermatology",
    });

    const result = await searchDoctor({ specialization: "Cardiology" });
    expect(result.outcome).toBe("found");
    if (result.outcome === "found") {
      expect(result.doctor.specialization).toBe("Cardiology");
      expect(result.doctors.every((d) => d.specialization === "Cardiology")).toBe(true);
    }
  });

  it("TC-002 returns not_found for an unknown name", async () => {
    await doctorRepository.create({
      name: "Dr. Priyanka Singh",
      specialization: "ENT",
      department: "ENT",
    });
    const result = await searchDoctor({ name: "Dr. Nobody Exists" });
    expect(result.outcome).toBe("not_found");
    expect(result.doctors).toHaveLength(0);
  });

  it("TC-003 returns multiple_matches for a shared specialty", async () => {
    await doctorRepository.create({
      name: "Dr. Kapil Sharma",
      specialization: "Pediatrics",
      department: "Paediatrics & Neonatology",
    });
    await doctorRepository.create({
      name: "Dr. Sanjay Gupta",
      specialization: "Pediatrics",
      department: "Paediatrics & Neonatology",
    });

    const result = await searchDoctor({ specialization: "Pediatrics" });
    expect(result.outcome).toBe("multiple_matches");
    if (result.outcome === "multiple_matches") {
      expect(result.doctors).toHaveLength(2);
    }
  });

  it("TC-004 returns unavailable for on-leave / unavailable doctors", async () => {
    await doctorRepository.create({
      name: "Dr. Tarun Kumar Mittal",
      specialization: "Pediatrics",
      department: "Paediatrics & Neonatology",
      availabilityStatus: "ON_LEAVE",
    });
    const result = await searchDoctor({ name: "Tarun Kumar Mittal" });
    expect(result.outcome).toBe("unavailable");
    if (result.outcome === "unavailable") {
      expect(result.doctors[0].availabilityStatus).toBe("ON_LEAVE");
    }
  });

  it("rejects empty search filters", async () => {
    await expect(searchDoctor({})).rejects.toBeInstanceOf(ValidationError);
  });

  it("tool wrapper returns the same contract", async () => {
    await doctorRepository.create({
      name: "Dr. Rohit Yogendra Goyal",
      specialization: "Orthopedics",
      department: "Orthopedics",
    });
    const result = await searchDoctorTool({ specialty: "Orthopedics" });
    expect(result.outcome).toBe("found");
  });
});
